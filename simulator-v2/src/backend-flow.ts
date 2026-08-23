import { detectExecutedTradeResume, fetchVaultTradeCursor } from "./vault-cursor";
import { fetchWithdrawShares, fetchWithdrawTargets, fetchWithdrawHoldings } from "./shares";
import { parseSecretKey, signWirePartial, signWithExternalWallet, solToLamports } from "./keys";
import type { Keypair } from "@solana/web3.js";
import type { NodeUpdate, RetailSettings, SimMode } from "../shared/events";

const CLUSTER = import.meta.env.VITE_CLUSTER ?? "devnet";
const DEMO_OUTPUT_MINT = import.meta.env.VITE_DEMO_OUTPUT_MINT ?? "";
const RPC_URL = import.meta.env.VITE_SOLANA_RPC ?? "https://api.devnet.solana.com";
const DEMO_TRADE_AMOUNT = 30_000_000;
/** Devnet priority fee (micro-lamports per CU) — speeds up strategist steps. */
const DEFAULT_PRIORITY_FEE = 150_000;
const DEFAULT_CU_LIMIT = 400_000;
const FLOW_POLL_MS = 350;
const CONFIRM_POLL_MS = 400;

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

type PreparedTx = {
  transaction: string;
  signingMode?: string;
  message?: string;
  accounts?: Record<string, string>;
  signerDetails?: Array<{ pubkey: string; signerKind?: string; userMustSign?: boolean }>;
  requiredSigners?: string[];
};

type FlowStep = {
  id: string;
  seq: number;
  name: string;
  signerRole: string;
  signerPubkey?: string;
  status: string;
  prepared?: PreparedTx;
  signerDetails?: PreparedTx["signerDetails"];
  signature?: string;
  error?: string;
};

type FlowJob = {
  id: string;
  status: string;
  mode: string;
  currentStep: number;
  context?: Record<string, unknown>;
  error?: string;
  steps?: FlowStep[];
};

const STEP_NODE: Record<string, NodeUpdate["id"]> = {
  register_strategist: "license",
  lock_license: "license",
  create_vault: "vault",
  create_investor_config: "settings",
  update_investor_config: "settings",
  follow_on: "settings",
  follow_off: "settings",
  park: "deposit",
  update_nav: "mark",
  withdraw: "toWallet",
  request_trade: "request",
  execute_trade: "execute",
  open_position: "openPos",
  request_sell: "request",
  exit_position: "closePos",
  accrue_fees: "accrue",
  claim_fees: "claim",
  initiate_close: "vault",
  close_vault: "vault",
  unlock_license: "license",
};

function qs(extra?: Record<string, string>): string {
  const p = new URLSearchParams({ cluster: CLUSTER, ...(extra ?? {}) });
  return `?${p}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }
  return json.data as T;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function currentAwaiting(job: FlowJob): FlowStep | undefined {
  return job.steps?.find(
    (s) =>
      s.seq === job.currentStep &&
      (s.status === "awaiting_signature" || s.status === "pending")
  );
}

function accountsFromStep(step: FlowStep): Record<string, string> {
  const raw = step.prepared?.accounts;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v != null && String(v) !== "") out[k] = String(v);
  }
  return out;
}

function stepFields(step: FlowStep, job: FlowJob, extra?: Record<string, string>): Record<string, string> | undefined {
  const acc = accountsFromStep(step);
  if (step.name === "create_vault") {
    const ctx = (job.context ?? {}) as Record<string, unknown>;
    const vid = ctx.vaultId ?? acc.vaultId;
    const vault = ctx.vault ?? acc.vault;
    if (vid != null && String(vid) !== "") acc.vaultId = String(vid);
    if (vault) acc.vault = String(vault);
    if (ctx.vaultTokenAccount) acc.vaultTokenAccount = String(ctx.vaultTokenAccount);
    if (ctx.vaultType) acc.vaultType = String(ctx.vaultType);
    if (ctx.vaultTypeLabel) acc.vaultTypeLabel = String(ctx.vaultTypeLabel);
  }
  const merged = { ...acc, ...extra };
  return Object.keys(merged).length ? merged : undefined;
}

function emitStep(
  emit: (u: NodeUpdate) => void,
  step: FlowStep,
  status: NodeUpdate["status"],
  detail?: string,
  tx?: string,
  fields?: Record<string, string>
) {
  const id = STEP_NODE[step.name] ?? "vault";
  emit({ id, status, detail, tx, fields });
}

async function nextVaultId(strategist: string): Promise<number> {
  const data = await api<{ items?: Array<{ vaultId?: number }> }>(
    `/v1/vaults${qs({ strategist, pageSize: "100" })}`
  );
  let max = 0;
  for (const v of data.items ?? []) {
    if (typeof v.vaultId === "number" && v.vaultId > max) max = v.vaultId;
  }
  let candidate = max + 1;
  // Indexer can lag behind chain — skip vault PDAs that already exist on-chain.
  try {
    const proto = await api<{ programId?: string }>(`/v1/protocol${qs()}`);
    const programId = proto.programId;
    if (programId) {
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const conn = new Connection(RPC_URL, "confirmed");
      const program = new PublicKey(programId);
      const st = new PublicKey(strategist);
      for (let i = 0; i < 64; i++) {
        const id = candidate + i;
        const idBuf = new Uint8Array(8);
        new DataView(idBuf.buffer).setBigUint64(0, BigInt(id), true);
        const [pda] = PublicKey.findProgramAddressSync(
          [new TextEncoder().encode("vault"), st.toBuffer(), idBuf],
          program
        );
        const info = await conn.getAccountInfo(pda, "confirmed");
        if (!info) return id;
      }
    }
  } catch {
    /* fall through to indexer-based id */
  }
  return candidate || 1;
}

function buildInvestors(
  degenPk: string,
  retailPks: string[],
  settings: RetailSettings
) {
  const tp = settings.takeProfitBps;
  const sl = settings.stopLossBps;
  const copyBps = settings.copyBps;
  const investors = [
    {
      pubkey: degenPk,
      role: "strategies",
      lamports: solToLamports(settings.degenParkSol),
      takeProfitBps: tp,
      stopLossBps: sl,
      autoFollow: settings.autoFollow,
      copyBps,
    },
  ];
  for (const pk of retailPks) {
    investors.push({
      pubkey: pk,
      role: "investors",
      lamports: solToLamports(settings.parkSol),
      takeProfitBps: tp,
      stopLossBps: sl,
      autoFollow: settings.autoFollow,
      copyBps,
    });
  }
  return investors;
}

async function buildStartBody(
  mode: SimMode,
  strategist: string,
  retailPks: string[],
  settings: RetailSettings,
  vaultId?: number,
  vaultPubkey?: string,
  outputMint?: string,
  vaultTokenAccount?: string,
  withdrawShares?: number,
  withdrawStrategist?: string
): Promise<Record<string, unknown>> {
  const investors = buildInvestors(strategist, retailPks, settings);
  const flowStrategist = withdrawStrategist || strategist;

  switch (mode) {
    case "create-vault": {
      // Always pick a free vault id (ignore stale activeVault from a prior run).
      const id = await nextVaultId(strategist);
      const vaultType = settings.vaultType === "sliced" ? "sliced" : "pooled";
      return {
        mode: "create-vault",
        strategist,
        vaultId: id,
        name: vaultType === "sliced" ? `Sliced Demo ${id}` : `Pooled Demo ${id}`,
        vaultType,
        investors,
      };
    }
    case "deposit":
      if (!vaultPubkey && !vaultId) throw new Error("Active vault required — run Create vault first");
      return {
        mode: "deposit",
        strategist,
        vault: vaultPubkey,
        vaultId,
        investors,
      };
    case "withdraw-wallet": {
      const retail = retailPks[0];
      if (!retail) throw new Error("Retail wallet required");
      const shares =
        withdrawShares ??
        (await fetchWithdrawShares({
          rpcUrl: RPC_URL,
          cluster: CLUSTER,
          vault: vaultPubkey!,
          investor: retail,
          strategist,
          vaultId,
        }));
      if (!vaultPubkey) throw new Error("Vault required for withdraw");
      if (shares <= 0) {
        throw new Error(
          "No on-chain vault shares for this wallet — run Deposit/Park first, or vault has no liquid wSOL to redeem."
        );
      }
      return {
        mode: "withdraw",
        strategist: flowStrategist,
        vault: vaultPubkey,
        vaultId,
        vaultTokenAccount: vaultTokenAccount || undefined,
        priorityFeeMicroLamports: DEFAULT_PRIORITY_FEE,
        computeUnitLimit: DEFAULT_CU_LIMIT,
        investors: [{ pubkey: retail, role: "investors", shares }],
      };
    }
    case "close-vault":
      if (!vaultPubkey && !vaultId) throw new Error("Active vault required");
      return {
        mode: "close-vault",
        strategist,
        vault: vaultPubkey,
        vaultId,
      };
    case "open-position": {
      if (!vaultPubkey && !vaultId) throw new Error("Active vault required");
      if (!outputMint) {
        throw new Error("outputMint missing — demo mint setup failed");
      }
      let tradeId = 1;
      let positionId = 1;
      let skipTradeSteps = false;
      if (vaultPubkey) {
        try {
          const proto = await api<{ programId?: string }>(`/v1/protocol${qs()}`).catch(
            (): { programId?: string } => ({})
          );
          const programId = proto.programId;
          if (programId) {
            const resume = await detectExecutedTradeResume(RPC_URL, vaultPubkey, programId);
            if (resume) {
              tradeId = resume.tradeId;
              positionId = resume.positionId;
              skipTradeSteps = true;
            }
          }
          if (!skipTradeSteps) {
            const onChain = await fetchVaultTradeCursor(RPC_URL, vaultPubkey);
            tradeId = onChain.tradeId;
            positionId = onChain.positionId;
          }
        } catch {
          const envelope = await api<{
            vault?: Record<string, unknown>;
            trades?: Array<{ trade_id?: number }>;
          }>(`/v1/vaults/${vaultPubkey}${qs()}`).catch(
            (): { vault?: Record<string, unknown>; trades?: Array<{ trade_id?: number }> } => ({})
          );
          const row = (envelope.vault ?? envelope) as Record<string, unknown>;
          tradeId = Number(row.nextTradeId ?? row.next_trade_id ?? 0);
          positionId = Number(row.nextPositionId ?? row.next_position_id ?? 0);
          if (!tradeId && envelope.trades?.length) {
            tradeId =
              Math.max(...envelope.trades.map((t) => Number(t.trade_id ?? 0))) + 1;
          }
          if (!tradeId) tradeId = 1;
          if (!positionId) positionId = 1;
        }
      }
      return {
        mode: "open-position",
        strategist,
        vault: vaultPubkey,
        vaultId,
        vaultTokenAccount: vaultTokenAccount || undefined,
        outputMint,
        tradeId: tradeId > 0 ? tradeId : 1,
        positionId: positionId > 0 ? positionId : 1,
        skipTradeSteps,
        amount: DEMO_TRADE_AMOUNT,
        entryValue: DEMO_TRADE_AMOUNT,
        outputAmount: DEMO_TRADE_AMOUNT,
        // Demo execute_trade: empty swap; received = in-ix output delta (0 if fill was a prior tx).
        minAmountOut: 0,
        takeProfitBps: settings.takeProfitBps,
        stopLossBps: settings.stopLossBps,
        slippageBps: 100,
        priorityFeeMicroLamports: DEFAULT_PRIORITY_FEE,
        computeUnitLimit: DEFAULT_CU_LIMIT,
        investors,
      };
    }
    default:
      throw new Error(`unsupported mode ${mode}`);
  }
}

export type WalletRunSlot = {
  source: "secret" | "wallet";
  secret?: string;
  pubkey: string;
};

export type RunInput = {
  degen: WalletRunSlot;
  retails: WalletRunSlot[];
  settings: RetailSettings;
  mode: SimMode;
  vaultId?: number;
  vaultPubkey?: string;
  vaultTokenAccount?: string;
  /** @internal set by multi-vault withdraw loop */
  _singleWithdraw?: boolean;
  _withdrawShares?: number;
  _withdrawStrategist?: string;
};

export async function runBackendFlow(
  input: RunInput,
  emit: (u: NodeUpdate) => void,
  onMeta: (event: string, data: unknown) => void
): Promise<{
  vaultId?: number;
  vault?: string;
  vaultTokenAccount?: string;
  closed?: boolean;
  withdrawSummary?: { redeemed: number; failed: number; remaining: number };
}> {
  const { degen, retails } = input;
  if (input.mode !== "withdraw-wallet" && !degen.pubkey) {
    throw new Error("Degen wallet required");
  }
  if (input.mode === "withdraw-wallet") {
    if (!retails.some((r) => r.pubkey)) throw new Error("Retail wallet required");
  } else if (retails.length === 0 && input.mode !== "close-vault") {
    throw new Error("At least one retail wallet required");
  }

  const keyByPub = new Map<string, Keypair>();
  const walletPubs = new Set<string>();

  if (degen.source === "secret") {
    if (!degen.secret) throw new Error("Degen private key required");
    const kp = parseSecretKey(degen.secret);
    if (kp.publicKey.toBase58() !== degen.pubkey) {
      throw new Error("Degen secret does not match loaded pubkey");
    }
    keyByPub.set(degen.pubkey, kp);
  } else if (degen.pubkey) {
    walletPubs.add(degen.pubkey);
  }

  for (const r of retails) {
    if (r.source === "secret") {
      if (!r.secret) throw new Error(`Retail private key required for ${r.pubkey}`);
      const kp = parseSecretKey(r.secret);
      if (kp.publicKey.toBase58() !== r.pubkey) {
        throw new Error("Retail secret does not match loaded pubkey");
      }
      keyByPub.set(r.pubkey, kp);
    } else {
      walletPubs.add(r.pubkey);
    }
  }

  const retailPks = retails.map((r) => r.pubkey).filter(Boolean);
  const strategist = degen.pubkey ?? "";

  if (input.mode === "withdraw-wallet" && !input._singleWithdraw) {
    const retail = retailPks[0];
    if (!retail) throw new Error("Retail wallet required");
    const proto = await api<{ programId?: string }>(`/v1/protocol${qs()}`);
    if (!proto.programId) throw new Error("protocol programId missing");
    const targets = await fetchWithdrawTargets({
      rpcUrl: RPC_URL,
      cluster: CLUSTER,
      investor: retail,
      programId: proto.programId,
    });
    if (targets.length === 0) {
      const holdings = await fetchWithdrawHoldings({
        rpcUrl: RPC_URL,
        cluster: CLUSTER,
        investor: retail,
        programId: proto.programId,
      });
      const blocked = holdings.filter((h) => h.onChainShares > 0 && h.redeemableShares <= 0);
      if (blocked.length > 0) {
        throw new Error(
          `Shares in ${blocked.length} vault(s) but no liquid wSOL to redeem — close positions first.`
        );
      }
      throw new Error(
        "No on-chain vault shares for this wallet — deposit/park first."
      );
    }

    emit({
      id: "toWallet",
      status: "running",
      detail: `Redeeming ${targets.length} vault(s) with liquid shares…`,
      fields: {
        pending: targets.map((t) => `${t.vaultId ? `#${t.vaultId}` : t.vault.slice(0, 8)}`).join(", "),
      },
    });

    let last: {
      vaultId?: number;
      vault?: string;
      vaultTokenAccount?: string;
      closed?: boolean;
    } = {};
    const redeemed: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const label = t.vaultId ? `Vault #${t.vaultId}` : t.vault.slice(0, 8);
      emit({
        id: "toWallet",
        status: "running",
        detail: `Redeeming ${i + 1}/${targets.length}: ${label}…`,
        fields: {
          step: `${i + 1}/${targets.length}`,
          vault: t.vault,
          vaultId: t.vaultId != null ? String(t.vaultId) : "",
          shares: String(t.shares),
        },
      });
      try {
        last = await runBackendFlow(
          {
            ...input,
            vaultPubkey: t.vault,
            vaultId: t.vaultId,
            vaultTokenAccount: t.vaultTokenAccount,
            _singleWithdraw: true,
            _withdrawShares: t.shares,
            _withdrawStrategist: t.strategist,
          },
          emit,
          onMeta
        );
        redeemed.push(label);
        emit({
          id: "toWallet",
          status: "success",
          detail: `Redeemed ${label}`,
          fields: { vault: t.vault, vaultId: t.vaultId != null ? String(t.vaultId) : "" },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed.push(`${label}: ${msg.slice(0, 80)}`);
        emit({
          id: "toWallet",
          status: "error",
          detail: `${label} failed — continuing…`,
          fields: { error: msg.slice(0, 200) },
        });
      }
    }

    const remainingHoldings = await fetchWithdrawHoldings({
      rpcUrl: RPC_URL,
      cluster: CLUSTER,
      investor: retail,
      programId: proto.programId,
    });
    const remaining = remainingHoldings.filter((h) => h.redeemableShares > 0);
    const blocked = remainingHoldings.filter(
      (h) => h.onChainShares > 0 && h.redeemableShares <= 0
    );

    const summary = {
      redeemed: redeemed.length,
      failed: failed.length,
      remaining: remaining.length,
    };

    onMeta("withdraw-summary", {
      redeemed,
      failed,
      remaining: remaining.map((h) => ({
        vault: h.vault,
        vaultId: h.vaultId,
        name: h.name,
        redeemableShares: h.redeemableShares,
        estLamports: h.estLamports,
        blockedReason: h.blockedReason,
      })),
      blocked: blocked.map((h) => ({
        vault: h.vault,
        vaultId: h.vaultId,
        name: h.name,
        onChainShares: h.onChainShares,
        blockedReason: h.blockedReason,
      })),
    });

    if (failed.length > 0 && redeemed.length === 0) {
      throw new Error(failed[0] ?? "withdraw failed");
    }

    emit({
      id: "toWallet",
      status: remaining.length > 0 || blocked.length > 0 ? "running" : "success",
      detail:
        remaining.length > 0
          ? `Done ${redeemed.length}/${targets.length} — ${remaining.length} vault(s) still redeemable`
          : blocked.length > 0
            ? `Done ${redeemed.length}/${targets.length} — ${blocked.length} vault(s) blocked (no liquid wSOL)`
            : `All ${redeemed.length} vault(s) redeemed to native SOL`,
      fields: {
        redeemed: String(redeemed.length),
        failed: String(failed.length),
        remaining: String(remaining.length),
        blocked: String(blocked.length),
      },
    });

    return { ...last, withdrawSummary: summary };
  }

  onMeta("start", {
    at: new Date().toISOString(),
    backend: true,
    mode: input.mode,
    cluster: CLUSTER,
    degenSource: degen.source,
  });

  let outputMint: string | undefined;
  let demoVaultAta: string | undefined;
  if (input.mode === "open-position") {
    if (!input.vaultPubkey) {
      throw new Error("Active vault required — run Create vault first");
    }
    emit({
      id: "ata",
      status: "running",
      detail: DEMO_OUTPUT_MINT
        ? "Ensuring vault ATA + demo fill for VITE_DEMO_OUTPUT_MINT"
        : "Creating DEMO mint + vault token account",
    });
    try {
      const { ensureDemoTradeMint } = await import("./demo-mint");
      const demo = await ensureDemoTradeMint({
        rpcUrl: RPC_URL,
        payer: keyByPub.get(degen.pubkey) ?? null,
        payerPubkey: degen.pubkey,
        vault: input.vaultPubkey,
        amount: BigInt(DEMO_TRADE_AMOUNT),
        existingMint: DEMO_OUTPUT_MINT || undefined,
        fill: false,
      });
      outputMint = demo.mint;
      demoVaultAta = demo.vaultAta;
      emit({
        id: "ata",
        status: "running",
        detail: "Allowlisting demo mint on vault…",
      });
      try {
        const { ensureVaultAcceptsMint } = await import("./ensure-accepted-mint");
        const allowSig = await ensureVaultAcceptsMint({
          cluster: CLUSTER,
          rpcUrl: RPC_URL,
          strategist: degen.pubkey,
          strategistKey: keyByPub.get(degen.pubkey) ?? null,
          walletPubkeys: walletPubs,
          vault: input.vaultPubkey,
          mint: demo.mint,
          priorityFeeMicroLamports: DEFAULT_PRIORITY_FEE,
          computeUnitLimit: DEFAULT_CU_LIMIT,
        });
        emit({
          id: "ata",
          status: "success",
          detail: [
            demo.created ? "DEMO mint ready" : "Vault ATA ready",
            allowSig ? `allowlisted · ${allowSig.slice(0, 8)}…` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          tx: allowSig ?? demo.sigs[demo.sigs.length - 1],
          fields: { mint: demo.mint, vaultAta: demo.vaultAta },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        emit({ id: "ata", status: "error", detail: msg.slice(0, 400) });
        throw e;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      emit({ id: "ata", status: "error", detail: msg.slice(0, 400) });
      throw e;
    }
  }

  const body = await buildStartBody(
    input.mode,
    strategist,
    retailPks,
    input.settings,
    input.vaultId,
    input.vaultPubkey,
    outputMint,
    input.vaultTokenAccount,
    input._withdrawShares,
    input._withdrawStrategist
  );

  let job = await api<FlowJob>(`/v1/flows${qs()}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (job.context?.vaultTokenSecret && job.context?.vaultTokenAccount) {
    try {
      const eph = parseSecretKey(String(job.context.vaultTokenSecret));
      keyByPub.set(String(job.context.vaultTokenAccount), eph);
    } catch {
      /* backend will co-sign */
    }
  }

  emit({
    id: "protocol",
    status: "ready",
    detail: `Backend flow ${job.id.slice(0, 8)}…`,
    fields: { mode: input.mode, cluster: CLUSTER },
  });

  const seen = new Set<string>();
  let openRetry = 0;

  for (let guard = 0; guard < 120; guard++) {
    if (job.status === "completed") {
      const vaultId = Number(job.context?.vaultId ?? body.vaultId ?? 0) || undefined;
      const vault = String(job.context?.vault ?? input.vaultPubkey ?? "");
      const vaultTokenAccount = String(
        job.context?.vaultTokenAccount ?? input.vaultTokenAccount ?? ""
      );
      const closed = input.mode === "close-vault";
      onMeta("done", {
        ok: true,
        mode: input.mode,
        vaultId,
        vault: vault || undefined,
        vaultTokenAccount: vaultTokenAccount || undefined,
        closed,
      });
      return {
        vaultId,
        vault: vault || undefined,
        vaultTokenAccount: vaultTokenAccount || undefined,
        closed,
      };
    }
    if (job.status === "failed") {
      const msg = job.error ?? "flow failed";
      if (/not executed on-chain/i.test(msg) && openRetry < 2) {
        openRetry++;
        emit({
          id: "protocol",
          status: "running",
          detail: "Retrying open_position after execute_trade confirm lag…",
        });
        job = await api<FlowJob>(`/v1/flows/${job.id}/retry${qs()}`, { method: "POST" });
        await sleep(300);
        continue;
      }
      throw new Error(msg);
    }

    if (job.status === "awaiting_signature") {
      const step = currentAwaiting(job);
      if (!step?.prepared?.transaction) {
        await sleep(FLOW_POLL_MS);
        job = await api<FlowJob>(`/v1/flows/${job.id}${qs()}`);
        continue;
      }
      // Fresh blockhash immediately before sign (avoids BlockhashNotFound after confirm delays)
      job = await api<FlowJob>(`/v1/flows/${job.id}/refresh${qs()}`, { method: "POST" });
      const stepFresh = currentAwaiting(job);
      if (!stepFresh?.prepared?.transaction) {
        throw new Error("refresh returned no prepared transaction");
      }
      const details =
        stepFresh.prepared.signerDetails ??
        stepFresh.signerDetails ??
        (stepFresh.prepared.requiredSigners ?? []).map((pubkey) => ({
          pubkey,
          userMustSign: true,
        }));

      const mustEOA = details.filter((d) => d.userMustSign === true);
      const required =
        mustEOA.length > 0
          ? mustEOA
          : details.filter((d) => d.userMustSign !== false).slice(0, 1);

      for (const d of required) {
        if (!keyByPub.has(d.pubkey) && !walletPubs.has(d.pubkey)) {
          throw new Error(`No local key / connected wallet for signer ${d.pubkey} (step ${stepFresh.name})`);
        }
      }

      emitStep(emit, stepFresh, "running", stepFresh.prepared.message ?? stepFresh.name);

      if (stepFresh.name === "execute_trade" && outputMint && demoVaultAta) {
        emitStep(emit, stepFresh, "running", "Demo fill → vault output ATA");
        const { mintDemoFill } = await import("./demo-mint");
        const fillSig = await mintDemoFill({
          rpcUrl: RPC_URL,
          payer: keyByPub.get(degen.pubkey) ?? null,
          payerPubkey: degen.pubkey,
          mint: outputMint,
          vaultAta: demoVaultAta,
          amount: BigInt(DEMO_TRADE_AMOUNT),
        });
        emitStep(emit, stepFresh, "running", `Demo fill ok · ${fillSig.slice(0, 8)}…`);
      }

      const needsWallet = required.some(
        (d) => walletPubs.has(d.pubkey) && !keyByPub.has(d.pubkey)
      );

      const signOnce = async (txB64: string) => {
        if (needsWallet) {
          let signed = txB64;
          for (const d of required) {
            if (walletPubs.has(d.pubkey)) {
              signed = await signWithExternalWallet(signed, d.pubkey);
            } else {
              const kp = keyByPub.get(d.pubkey);
              if (!kp) throw new Error(`No key for ${d.pubkey}`);
              signed = signWirePartial(signed, [kp]);
            }
          }
          return signed;
        }
        return signWirePartial(txB64, [...keyByPub.values()]);
      };

      let signed = await signOnce(stepFresh.prepared.transaction);
      try {
        job = await api<FlowJob>(`/v1/flows/${job.id}/submit${qs()}`, {
          method: "POST",
          body: JSON.stringify({ signedTransaction: signed }),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/BlockhashNotFound|blockhash not found|Blockhash not found/i.test(msg)) {
          throw e;
        }
        // One retry with a brand-new blockhash
        emitStep(emit, stepFresh, "running", "Blockhash expired — refreshing…");
        job = await api<FlowJob>(`/v1/flows/${job.id}/refresh${qs()}`, { method: "POST" });
        const again = currentAwaiting(job);
        if (!again?.prepared?.transaction) throw e;
        signed = await signOnce(again.prepared.transaction);
        job = await api<FlowJob>(`/v1/flows/${job.id}/submit${qs()}`, {
          method: "POST",
          body: JSON.stringify({ signedTransaction: signed }),
        });
      }
      const sig = job.steps?.find((s) => s.seq === stepFresh.seq)?.signature;
      emitStep(emit, stepFresh, "success", "Submitted", sig);
      seen.add(`${stepFresh.seq}:${stepFresh.name}`);
      await sleep(200);
      job = await api<FlowJob>(`/v1/flows/${job.id}${qs()}`);
      continue;
    }

    if (job.status === "confirming") {
      const step = job.steps?.find((s) => s.seq === job.currentStep);
      if (step && !seen.has(`${step.seq}:${step.name}:confirmed`)) {
        emitStep(emit, step, "running", "Confirming on-chain…");
      }
      await sleep(CONFIRM_POLL_MS);
      job = await api<FlowJob>(`/v1/flows/${job.id}${qs()}`);
      const step2 = job.steps?.find((s) => s.seq === job.currentStep);
      if (step2?.status === "confirmed" || step2?.status === "skipped") {
        emitStep(
          emit,
          step2,
          step2.status === "skipped" ? "skipped" : "success",
          step2.name,
          step2.signature ?? undefined,
          stepFields(step2, job)
        );
        seen.add(`${step2.seq}:${step2.name}:confirmed`);
      }
      continue;
    }

    for (const st of job.steps ?? []) {
      if ((st.status === "skipped" || st.status === "confirmed") && !seen.has(`${st.seq}:${st.name}:done`)) {
        emitStep(
          emit,
          st,
          st.status === "skipped" ? "skipped" : "success",
          st.name,
          st.signature ?? undefined,
          stepFields(st, job)
        );
        seen.add(`${st.seq}:${st.name}:done`);
      }
    }

    await sleep(FLOW_POLL_MS);
    job = await api<FlowJob>(`/v1/flows/${job.id}${qs()}`);
  }

  throw new Error("flow timeout — check backend logs and GET /v1/flows/{id}");
}

export async function fetchWalletBalance(pubkey: string): Promise<{ lamports: number; sol: string }> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [pubkey, { commitment: "confirmed" }],
    }),
  });
  const json = (await res.json()) as { result?: { value?: number } };
  const lamports = json.result?.value ?? 0;
  return { lamports, sol: (lamports / 1_000_000_000).toFixed(9) };
}
