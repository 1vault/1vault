import type { Keypair } from "@solana/web3.js";
import { getProtocol, getVault } from "../api/client";
import {
  getFlow,
  refreshFlow,
  retryFlow,
  startFlow,
  submitFlowStep,
  type FlowJob,
} from "../api/undocumented";
import { RPC_URL } from "../config";
import { parseSecretKey, signPreparedEOA, solToLamports } from "../signing";
import { ensureVaultAcceptsMint } from "./accept-mint";
import { ensureDemoTradeMint, mintDemoFill } from "./demo-mint";
import type { FlowEvent, FlowRunInput, FlowState } from "./types";
import { detectExecutedTradeResume, fetchVaultTradeCursor } from "./vault-cursor";
import { nextVaultId } from "./vault-id";

const DEMO_TRADE_AMOUNT = 30_000_000;
const DEFAULT_PRIORITY_FEE = 150_000;
const DEFAULT_CU_LIMIT = 400_000;
const FLOW_POLL_MS = 350;
const CONFIRM_POLL_MS = 400;

type FlowStep = NonNullable<FlowJob["steps"]>[number];

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

function buildInvestors(strategist: string, parkSol: number, tp: number, sl: number) {
  return [
    {
      pubkey: strategist,
      role: "strategies",
      lamports: solToLamports(parkSol),
      takeProfitBps: tp,
      stopLossBps: sl,
      autoFollow: true,
      copyBps: 10_000,
    },
  ];
}

async function buildStartBody(
  input: FlowRunInput,
  strategist: string
): Promise<Record<string, unknown>> {
  const parkSol = input.parkSol ?? 0.1;
  const tp = input.takeProfitBps ?? 5000;
  const sl = input.stopLossBps ?? 2500;
  const investors = buildInvestors(strategist, parkSol, tp, sl);

  switch (input.mode) {
    case "create-vault": {
      const id = await nextVaultId(strategist);
      const vaultType = input.vaultType === "sliced" ? "sliced" : "pooled";
      const trimmed = input.vaultName?.trim();
      return {
        mode: "create-vault",
        strategist,
        vaultId: id,
        name: trimmed || (vaultType === "sliced" ? `Sliced ${id}` : `Pooled ${id}`),
        vaultType,
        // No investors — config / follow / park are separate deposit flows.
      };
    }
    case "deposit":
      if (!input.vault && !input.vaultId) throw new Error("Active vault required");
      return {
        mode: "deposit",
        strategist,
        vault: input.vault,
        vaultId: input.vaultId,
        investors,
      };
    case "claim-fees":
      if (!input.vault && !input.vaultId) throw new Error("Active vault required");
      return {
        mode: "claim-fees",
        strategist,
        vault: input.vault,
        vaultId: input.vaultId,
        priorityFeeMicroLamports: DEFAULT_PRIORITY_FEE,
        computeUnitLimit: DEFAULT_CU_LIMIT,
      };
    case "close-vault":
      if (!input.vault && !input.vaultId) throw new Error("Active vault required");
      return {
        mode: "close-vault",
        strategist,
        vault: input.vault,
        vaultId: input.vaultId,
      };
    case "open-position": {
      if (!input.vault && !input.vaultId) throw new Error("Active vault required");
      let tradeId = 1;
      let positionId = 1;
      let skipTradeSteps = false;
      if (input.vault) {
        try {
          const proto = await getProtocol();
          if (proto.programId) {
            const resume = await detectExecutedTradeResume(RPC_URL, input.vault, proto.programId);
            if (resume) {
              tradeId = resume.tradeId;
              positionId = resume.positionId;
              skipTradeSteps = true;
            }
          }
          if (!skipTradeSteps) {
            const onChain = await fetchVaultTradeCursor(RPC_URL, input.vault);
            tradeId = onChain.tradeId;
            positionId = onChain.positionId;
          }
        } catch {
          const envelope = (await getVault(input.vault).catch(() => ({}))) as Record<
            string,
            unknown
          > & { vault?: Record<string, unknown> };
          const row = envelope.vault ?? envelope;
          tradeId = Number(row.nextTradeId ?? row.next_trade_id ?? 0) || 1;
          positionId = Number(row.nextPositionId ?? row.next_position_id ?? 0) || 1;
        }
      }
      return {
        mode: "open-position",
        strategist,
        vault: input.vault,
        vaultId: input.vaultId,
        tradeId: tradeId > 0 ? tradeId : 1,
        positionId: positionId > 0 ? positionId : 1,
        skipTradeSteps,
        amount: DEMO_TRADE_AMOUNT,
        entryValue: DEMO_TRADE_AMOUNT,
        outputAmount: DEMO_TRADE_AMOUNT,
        minAmountOut: 0,
        takeProfitBps: tp,
        stopLossBps: sl,
        slippageBps: 100,
        priorityFeeMicroLamports: DEFAULT_PRIORITY_FEE,
        computeUnitLimit: DEFAULT_CU_LIMIT,
        investors,
      };
    }
    case "exit-position": {
      if (!input.vault && !input.vaultId) throw new Error("Active vault required");
      if (!input.positionId || !input.tradeId) throw new Error("positionId and tradeId required");
      if (!input.inputMint) throw new Error("inputMint (token to sell) required");
      return {
        mode: "exit-position",
        strategist,
        vault: input.vault,
        vaultId: input.vaultId,
        positionId: input.positionId,
        tradeId: input.tradeId,
        inputMint: input.inputMint,
        exitPercent: input.exitPercent ?? 100,
        slippageBps: 100,
        minAmountOut: 0,
        baseAmount: input.baseAmount ?? 0,
        priorityFeeMicroLamports: DEFAULT_PRIORITY_FEE,
        computeUnitLimit: DEFAULT_CU_LIMIT,
      };
    }
    case "withdraw": {
      if (!input.vault) throw new Error("vault required");
      if (input.shares == null || input.shares === "") throw new Error("shares required");
      const shares =
        typeof input.shares === "string" ? Number(BigInt(input.shares)) : input.shares;
      return {
        mode: "withdraw",
        strategist,
        vault: input.vault,
        vaultId: input.vaultId,
        investors: [
          {
            pubkey: strategist,
            role: "investors",
            lamports: 0,
            shares,
          },
        ],
      };
    }
    default:
      throw new Error(`unsupported mode ${(input as FlowRunInput).mode}`);
  }
}

export type FlowCallbacks = {
  onState: (state: FlowState) => void;
};

export async function runFlow(
  input: FlowRunInput,
  strategistKey: Keypair,
  callbacks: FlowCallbacks
): Promise<FlowState["result"]> {
  const strategist = input.strategist;
  const keyByPub = new Map<string, Keypair>([[strategist, strategistKey]]);
  const events: FlowEvent[] = [];

  const push = (step: string, status: FlowEvent["status"], detail?: string, tx?: string) => {
    events.push({ at: new Date().toISOString(), step, status, detail, tx });
    callbacks.onState({
      status: "running",
      mode: input.mode,
      events: [...events],
    });
  };

  let outputMint: string | undefined;
  let demoVaultAta: string | undefined;

  if (input.mode === "open-position") {
    if (!input.vault) throw new Error("Active vault required");
    push("demo_mint", "running", "Creating demo mint + vault ATA");
    try {
      const demo = await ensureDemoTradeMint({
        rpcUrl: RPC_URL,
        payer: strategistKey,
        vault: input.vault,
        amount: BigInt(DEMO_TRADE_AMOUNT),
        fill: false,
      });
      outputMint = demo.mint;
      demoVaultAta = demo.vaultAta;
      push("allowlist", "running", "Allowlisting demo mint on vault");
      const allowSig = await ensureVaultAcceptsMint({
        strategistKey,
        strategist,
        vault: input.vault,
        mint: demo.mint,
      });
      push("demo_mint", "success", "Demo mint ready", allowSig ?? demo.sigs[demo.sigs.length - 1]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      push("demo_mint", "error", msg.slice(0, 400));
      throw e;
    }
  }

  const body = await buildStartBody(input, strategist);
  if (outputMint) body.outputMint = outputMint;

  let job = await startFlow(body);
  callbacks.onState({
    status: "running",
    mode: input.mode,
    flowId: job.id,
    events: [...events],
  });

  if (job.context?.vaultTokenSecret && job.context?.vaultTokenAccount) {
    try {
      const eph = parseSecretKey(String(job.context.vaultTokenSecret));
      keyByPub.set(String(job.context.vaultTokenAccount), eph);
    } catch {
      /* backend co-signs */
    }
  }

  push("flow", "running", `Started ${job.id.slice(0, 8)}…`);

  const seen = new Set<string>();
  let openRetry = 0;

  for (let guard = 0; guard < 120; guard++) {
    if (job.status === "completed") {
      const vaultId = Number(job.context?.vaultId ?? body.vaultId ?? 0) || undefined;
      const vault = String(job.context?.vault ?? input.vault ?? "");
      const vaultTokenAccount = String(job.context?.vaultTokenAccount ?? "");
      const result = {
        vaultId,
        vault: vault || undefined,
        vaultTokenAccount: vaultTokenAccount || undefined,
        closed: input.mode === "close-vault",
      };
      const final: FlowState = {
        status: "completed",
        mode: input.mode,
        flowId: job.id,
        events,
        result,
      };
      callbacks.onState(final);
      return result;
    }

    if (job.status === "failed") {
      const msg = job.error ?? "flow failed";
      if (/not executed on-chain/i.test(msg) && openRetry < 2) {
        openRetry++;
        push("flow", "running", "Retrying open_position after confirm lag…");
        job = await retryFlow(job.id);
        await sleep(300);
        continue;
      }
      const final: FlowState = {
        status: "failed",
        mode: input.mode,
        flowId: job.id,
        events,
        error: msg,
      };
      callbacks.onState(final);
      throw new Error(msg);
    }

    if (job.status === "awaiting_signature") {
      let step = currentAwaiting(job);
      if (!step?.prepared?.transaction) {
        await sleep(FLOW_POLL_MS);
        job = await getFlow(job.id);
        continue;
      }

      // Use the prepared tx as-is. Refresh only when blockhash expires (below).
      const details =
        step.prepared.signerDetails ??
        step.signerDetails ??
        (step.prepared.requiredSigners ?? []).map((pubkey) => ({
          pubkey,
          userMustSign: true,
        }));

      push(step.name, "running", step.name);

      if (step.name === "execute_trade" && outputMint && demoVaultAta) {
        push("execute_trade", "running", "Demo fill → vault output ATA");
        const fillSig = await mintDemoFill({
          rpcUrl: RPC_URL,
          payer: strategistKey,
          mint: outputMint,
          vaultAta: demoVaultAta,
          amount: BigInt(DEMO_TRADE_AMOUNT),
        });
        push("execute_trade", "running", `Demo fill ok · ${fillSig.slice(0, 8)}…`);
      }

      let signed = signPreparedEOA(step.prepared.transaction, details, keyByPub);
      try {
        job = await submitFlowStep(job.id, signed);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/BlockhashNotFound|blockhash not found|Blockhash not found/i.test(msg)) {
          throw e;
        }
        push(step.name, "running", "Blockhash expired — refreshing…");
        job = await refreshFlow(job.id);
        const again = currentAwaiting(job);
        if (!again?.prepared?.transaction) throw e;
        signed = signPreparedEOA(again.prepared.transaction, details, keyByPub);
        job = await submitFlowStep(job.id, signed);
      }

      const sig = job.steps?.find((s) => s.seq === step!.seq)?.signature;
      push(step.name, "success", "Submitted", sig);
      seen.add(`${step.seq}:${step.name}`);
      job = await getFlow(job.id);
      continue;
    }

    if (job.status === "confirming") {
      const step = job.steps?.find((s) => s.seq === job.currentStep);
      if (step && !seen.has(`${step.seq}:${step.name}:confirmed`)) {
        push(step.name, "running", "Confirming on-chain…");
      }
      await sleep(CONFIRM_POLL_MS);
      job = await getFlow(job.id);
      const step2 = job.steps?.find((s) => s.seq === job.currentStep);
      if (step2?.status === "confirmed" || step2?.status === "skipped") {
        push(
          step2.name,
          step2.status === "skipped" ? "skipped" : "success",
          step2.name,
          step2.signature
        );
        seen.add(`${step2.seq}:${step2.name}:confirmed`);
      }
      continue;
    }

    for (const st of job.steps ?? []) {
      if ((st.status === "skipped" || st.status === "confirmed") && !seen.has(`${st.seq}:${st.name}:done`)) {
        push(st.name, st.status === "skipped" ? "skipped" : "success", st.name, st.signature);
        seen.add(`${st.seq}:${st.name}:done`);
      }
    }

    await sleep(FLOW_POLL_MS);
    job = await getFlow(job.id);
  }

  throw new Error("flow timeout — check GET /v1/flows/{id}");
}
