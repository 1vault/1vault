import "./polyfill";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  clearKeyring,
  getStoredPubkey,
  getUnlockedKeypair,
  hasKeyring,
  importAndLock,
  isUnlocked,
  lock,
  requireUnlockedKeypair,
  restoreSession,
  touchSession,
  unlock,
} from "../lib/keyring";
import { getHealth, getProtocol, getStrategist, listVaults, listVaultPositions, listVaultTrades } from "../lib/api";
import { estimatePipeline, estimateParkBreakdown } from "../lib/estimate";
import { runFlow, type FlowMode, type FlowRunInput, type FlowState } from "../lib/flow";
import { indexerHealth } from "../lib/indexer/client";
import { signWirePartial } from "../lib/signing";
import { clearSession } from "../lib/auth";
import { annotateVaultLayout, sortVaultsOpenFirst } from "../lib/vault-layout";
import { readVaultSnapshot, writeVaultSnapshot } from "../lib/vault-session";
import { filterVisibleVaults, isVaultRowTradeable } from "../lib/vault-status";
import { attachTradeIds, parseVaultPositions } from "../lib/trade/positions";
import { RPC_URL } from "../lib/config";
import { runParkGuest } from "../lib/investor-tx";
import { sleep, withRpcRetry } from "../lib/rpc-retry";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { runForceCloseLegacyVault, runUnlockLicense } from "../lib/tx-run";
import { classifyVaultSlot, fetchStrategistVaultMeta } from "../lib/flow/vault-slots";

export type Msg =
  | { type: "PING" }
  | { type: "HEALTH" }
  | { type: "PROTOCOL" }
  | { type: "KEYRING_STATUS" }
  | { type: "KEYRING_IMPORT"; secret: string; password: string }
  | { type: "KEYRING_UNLOCK"; password: string }
  | { type: "KEYRING_LOCK" }
  | { type: "KEYRING_CLEAR" }
  | { type: "LOGOUT_ALL" }
  | { type: "MY_VAULTS"; light?: boolean; tradeableOnly?: boolean }
  | { type: "PIPELINE"; vault: string }
  | { type: "PARK_BREAKDOWN"; vault: string; walletPubkey?: string }
  | { type: "WALLET_BALANCE"; pubkey?: string }
  | { type: "SIGN_BIND_MESSAGE"; message: string }
  | { type: "UNLOCK_LICENSE"; strategist: string }
  | { type: "FORCE_CLOSE_LEGACY"; vault: string; vaultId: number; strategist?: string }
  | { type: "RELEASE_LICENSE"; strategist?: string; vaultIds?: number[]; includeLeftovers?: boolean }
  | { type: "SIGN_WIRE"; transactionB64: string }
  | {
      type: "PARK_GUEST";
      vault: string;
      lamports: number;
    }
  | {
      type: "RUN_FLOW";
      mode: FlowMode;
      vault?: string;
      vaultId?: number;
      vaultType?: "pooled" | "sliced";
      vaultName?: string;
      performanceFeeBps?: number;
      earlyExitFeeBps?: number;
      parkSol?: number;
      positionId?: number;
      tradeId?: number;
      inputMint?: string;
      exitPercent?: number;
      shares?: number | string;
      slippageBps?: number;
      priorityFeeMicroLamports?: number;
    }
  | { type: "OPEN_SIDE_PANEL" }
  | { type: "VAULT_POSITIONS"; vault: string }
  | { type: "SESSION_GET"; keys: string[] }
  | { type: "SESSION_SET"; values: Record<string, unknown> }
  | { type: "FLOW_STATE" }
  | { type: "FLOW_CANCEL" };

export type MsgResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

const FLOW_STORAGE_KEY = "flowState";

let flowState: FlowState = { status: "idle", events: [] };
let flowAbort: AbortController | null = null;
/** True only while this SW instance is executing runFlow. */
let flowJobActive = false;

async function persistFlowState() {
  try {
    await chrome.storage.session.set({ [FLOW_STORAGE_KEY]: flowState });
  } catch {
    /* SW may be stopping — ignore */
  }
}

/** SW restart leaves status=running with no live job — unlock Claim/Close/Release. */
function recoverStaleFlow(): void {
  if (flowState.status !== "running" || flowJobActive) return;
  flowState = {
    ...flowState,
    status: "failed",
    error: "interrupted — retry the action",
  };
  void persistFlowState();
}

async function loadFlowState() {
  try {
    const stored = await chrome.storage.session.get(FLOW_STORAGE_KEY);
    if (stored[FLOW_STORAGE_KEY]) {
      flowState = stored[FLOW_STORAGE_KEY] as FlowState;
    }
    recoverStaleFlow();
  } catch {
    /* ignore */
  }
}

void loadFlowState();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onMessage.addListener((message: Msg, sender, sendResponse) => {
  if (message.type === "OPEN_SIDE_PANEL") {
    const windowId = sender.tab?.windowId;
    if (windowId != null) {
      void chrome.sidePanel.open({ windowId }).catch(() => {});
    }
    sendResponse({ ok: true, data: { opened: true } });
    return false;
  }
  void (async () => {
    try {
      const data = await handle(message);
      sendResponse({ ok: true, data } satisfies MsgResult);
    } catch (e) {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      } satisfies MsgResult);
    }
  })();
  return true;
});

async function handle(message: Msg): Promise<unknown> {
  // MV3 SW may restart and wipe in-memory session — restore first.
  await restoreSession();
  // Any SW activity extends the unlock idle window (long close / Release flows).
  if (isUnlocked()) touchSession();
  recoverStaleFlow();

  switch (message.type) {
    case "PING":
      return { pong: true, at: new Date().toISOString() };
    case "HEALTH": {
      const [backend, indexer] = await Promise.allSettled([getHealth(), indexerHealth()]);
      return {
        backend: backend.status === "fulfilled" ? backend.value : { error: String(backend.reason) },
        indexer: indexer.status === "fulfilled" ? indexer.value : { error: String(indexer.reason) },
      };
    }
    case "PROTOCOL":
      return getProtocol();
    case "KEYRING_STATUS": {
      const has = await hasKeyring();
      const pubkey = await getStoredPubkey();
      return { has, unlocked: isUnlocked(), pubkey };
    }
    case "KEYRING_IMPORT":
      return { pubkey: await importAndLock(message.secret, message.password) };
    case "KEYRING_UNLOCK":
      return { pubkey: await unlock(message.password) };
    case "KEYRING_LOCK":
      await lock();
      return { unlocked: false };
    case "KEYRING_CLEAR":
      await clearKeyring();
      return { cleared: true };
    case "LOGOUT_ALL":
      await lock();
      await clearKeyring();
      await clearSession();
      flowAbort?.abort();
      flowAbort = null;
      flowState = { status: "idle", events: [] };
      await chrome.storage.session.clear();
      return { cleared: true };
    case "MY_VAULTS": {
      const pubkey = (await getStoredPubkey()) ?? getUnlockedKeypair()?.publicKey.toBase58();
      if (!pubkey) throw new Error("import or unlock keyring first");
      const [strat, listed, protocol] = await Promise.all([
        getStrategist(pubkey).catch(() => ({ vaults: [] as Array<Record<string, unknown>> })),
        listVaults({ strategist: pubkey, pageSize: 100 }).catch(() => ({ items: [] })),
        getProtocol().catch(() => ({})),
      ]);

      // Home = vaults owned by this wallet only (never the global vault list).
      const byPk = new Map<string, Record<string, unknown>>();
      for (const v of strat.vaults ?? []) {
        const pk = String(v.pubkey ?? "");
        if (pk.length < 32) continue;
        const owner: string = String(v.strategist ?? "");
        if (owner && owner !== pubkey) continue;
        byPk.set(pk, { ...v, strategist: pubkey });
      }
      for (const v of listed.items ?? []) {
        const pk = String(v.pubkey ?? "");
        if (pk.length < 32) continue;
        // listVaults must explicitly match strategist — ignore unscoped rows.
        if (String(v.strategist ?? "") !== pubkey) continue;
        byPk.set(pk, { ...byPk.get(pk), ...v, strategist: pubkey });
      }
      const vaults = [...byPk.values()];

      const tradeableOnly = Boolean(message.tradeableOnly);
      const pickTradeable = (rows: Array<Record<string, unknown>>) =>
        filterVisibleVaults(rows).filter(isVaultRowTradeable);

      // GMGN: serve cached annotated Active vaults when snapshot is still fresh.
      if (tradeableOnly) {
        const snap = await readVaultSnapshot().catch(() => ({
          rows: [] as Array<Record<string, unknown>>,
          fresh: false,
          at: undefined,
        }));
        if (snap.fresh && snap.rows.length > 0) {
          const active = pickTradeable(snap.rows);
          if (active.length > 0) {
            return {
              pubkey,
              vaults: sortVaultsOpenFirst(active),
              protocol,
              cached: true,
            };
          }
        }
      }

      // Light mode: skip RPC annotate (sidepanel / home always use full annotate).
      if (message.light && !tradeableOnly) {
        return {
          pubkey,
          vaults: sortVaultsOpenFirst(vaults),
          protocol,
          light: true,
        };
      }

      const annotated = await annotateVaultLayout(vaults).catch(() =>
        // RPC flakiness must not permanently disable Close as "legacy".
        sortVaultsOpenFirst(
          vaults.map((v) => ({
            ...v,
            closeBlockedReason: "rpc",
            canClose: undefined,
            layoutCompatible: undefined,
          }))
        )
      );
      await writeVaultSnapshot(annotated).catch(() => undefined);
      const out = tradeableOnly ? pickTradeable(annotated) : annotated;
      return { pubkey, vaults: sortVaultsOpenFirst(out), protocol };
    }
    case "PIPELINE":
      return estimatePipeline(message.vault);
    case "PARK_BREAKDOWN": {
      const pipeline = await estimatePipeline(message.vault);
      let walletBalance: string | null = null;
      const pk = message.walletPubkey ?? (await getStoredPubkey());
      if (pk) {
        try {
          const conn = new Connection(RPC_URL, "confirmed");
          const bal = await conn.getBalance(new PublicKey(pk));
          walletBalance = String(bal);
        } catch {
          walletBalance = null;
        }
      }
      return estimateParkBreakdown(message.vault, pipeline, pk, walletBalance);
    }
    case "WALLET_BALANCE": {
      const pk = message.pubkey ?? (await getStoredPubkey()) ?? getUnlockedKeypair()?.publicKey.toBase58();
      if (!pk) return { lamports: "0" };
      const conn = new Connection(RPC_URL, "confirmed");
      const bal = await conn.getBalance(new PublicKey(pk));
      return { lamports: String(bal), pubkey: pk };
    }
    case "SIGN_BIND_MESSAGE": {
      const kp = await requireUnlockedKeypair();
      const bytes = new TextEncoder().encode(message.message);
      return { signature: bs58.encode(nacl.sign.detached(bytes, kp.secretKey)) };
    }
    case "UNLOCK_LICENSE": {
      const kp = await requireUnlockedKeypair();
      const sig = await withRpcRetry(() => runUnlockLicense(message.strategist, kp));
      return { signature: sig };
    }
    case "FORCE_CLOSE_LEGACY": {
      const kp = await requireUnlockedKeypair();
      const strategist =
        message.strategist ?? kp.publicKey.toBase58() ?? (await getStoredPubkey());
      if (!strategist) throw new Error("strategist required");
      if (!message.vaultId) throw new Error("vaultId required for force-close legacy");
      const sig = await withRpcRetry(() =>
        runForceCloseLegacyVault(
          { strategist, vault: message.vault, vaultId: message.vaultId },
          kp
        )
      );
      return { signature: sig, vault: message.vault };
    }
    case "RELEASE_LICENSE": {
      const kp = await requireUnlockedKeypair();
      const strategist =
        message.strategist ?? kp.publicKey.toBase58() ?? (await getStoredPubkey());
      if (!strategist) throw new Error("strategist required");
      if (flowState.status === "running" || flowJobActive) {
        throw new Error("a flow is already running — wait or cancel, then retry Release");
      }

      const selectedIds = Array.isArray(message.vaultIds)
        ? [...new Set(message.vaultIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))]
        : null;
      const includeLeftovers = message.includeLeftovers !== false;

      type ReleasedVault = {
        vaultId: number;
        pubkey: string;
        kind: "open" | "legacy" | "closed" | "missing";
        action: "closed" | "cleared";
      };

      const pushRelease = (detail: string) => {
        flowState = {
          status: "running",
          mode: "close-vault",
          events: [
            ...(flowState.events ?? []),
            { at: new Date().toISOString(), step: "release", status: "running", detail },
          ],
        };
        void persistFlowState();
      };

      const isAlreadyReleased = (msg: string) =>
        /licence already unlocked|license already unlocked|LicenseNotActive|already unlocked/i.test(
          msg
        );

      const isMissingAccount = (msg: string) =>
        /3012|AccountNotInitialized|account not found|Required account missing|Something didn.t finish cleaning/i.test(
          msg
        );

      const isActiveVaultsBlock = (msg: string) =>
        /ActiveVaultsRemain|still has .* active vault|cannot unlock/i.test(msg);

      const finishOk = async (sig: string, released: ReleasedVault[]) => {
        flowState = {
          status: "completed",
          mode: "close-vault",
          events: flowState.events,
          result: { closed: true },
        };
        await persistFlowState();
        return {
          signature: sig,
          cleaned: released.length,
          alreadyReleased: sig === "already-released",
          vaults: released,
        };
      };

      const tryUnlock = async (): Promise<{ ok: true; sig: string } | { ok: false; msg: string }> => {
        try {
          const sig = await withRpcRetry(() => runUnlockLicense(strategist, kp));
          return { ok: true, sig };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (isAlreadyReleased(msg)) {
            return { ok: true, sig: "already-released" };
          }
          if (isMissingAccount(msg)) {
            try {
              const live = await fetchStrategistVaultMeta(strategist);
              if (live.activeVaultCount <= 0) {
                return { ok: true, sig: "already-released" };
              }
            } catch {
              /* fall through */
            }
          }
          return { ok: false, msg };
        }
      };

      const forcePurgeSlot = async (vault: string, vaultId: number) => {
        try {
          await withRpcRetry(() =>
            runForceCloseLegacyVault({ strategist, vault, vaultId }, kp)
          );
          return true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (isMissingAccount(msg) || /ConstraintSeeds|seeds constraint|0x7d6|401|NotLegacy/i.test(msg)) {
            return false;
          }
          throw e;
        }
      };

      const shouldProcessId = (vaultId: number, kind: string) => {
        if (selectedIds == null || selectedIds.length === 0) return true;
        if (selectedIds.includes(vaultId)) return true;
        // Leftover missing/closed slots not shown in the picker.
        if (includeLeftovers && (kind === "missing" || kind === "closed" || kind === "legacy")) {
          return true;
        }
        return false;
      };

      flowJobActive = true;
      flowState = { status: "running", mode: "close-vault", events: [] };
      await persistFlowState();

      try {
        pushRelease("Trying unlock…");
        const first = await tryUnlock();
        if (first.ok) return finishOk(first.sig, []);
        if (!isActiveVaultsBlock(first.msg)) throw new Error(first.msg);

        pushRelease("Cleaning up vaults…");
        await sleep(700);
        const meta = await fetchStrategistVaultMeta(strategist);
        const maxId = Math.max(meta.vaultCount, 1);
        const released: ReleasedVault[] = [];

        for (let vaultId = 1; vaultId <= maxId; vaultId++) {
          const live = await fetchStrategistVaultMeta(strategist).catch(() => null);
          if (live && live.activeVaultCount <= 0) break;

          const slot = await classifyVaultSlot(meta.programId, strategist, vaultId);
          if (!shouldProcessId(vaultId, slot.kind)) continue;

          pushRelease(`Cleaning vault #${vaultId}…`);
          await sleep(vaultId === 1 ? 800 : 1400);

          if (slot.kind === "open") {
            let ok = false;
            try {
              await runFlow(
                {
                  mode: "close-vault",
                  strategist,
                  vault: slot.pubkey,
                  vaultId,
                },
                kp,
                {
                  onState: (s) => {
                    flowState = {
                      ...s,
                      status: s.status === "failed" ? "failed" : "running",
                      mode: "close-vault",
                    };
                    void persistFlowState();
                  },
                }
              );
              ok = true;
            } catch {
              ok = await forcePurgeSlot(slot.pubkey, vaultId);
            }
            if (ok) {
              released.push({
                vaultId,
                pubkey: slot.pubkey,
                kind: "open",
                action: "closed",
              });
            }
          } else if (await forcePurgeSlot(slot.pubkey, vaultId)) {
            released.push({
              vaultId,
              pubkey: slot.pubkey,
              kind: slot.kind,
              action: "cleared",
            });
          }
          await sleep(1000);
        }

        pushRelease("Unlocking $1VAULT…");
        await sleep(1200);
        const last = await tryUnlock();
        if (last.ok) return finishOk(last.sig, released);

        if (isActiveVaultsBlock(last.msg)) {
          if (includeLeftovers) {
            pushRelease("Finishing cleanup…");
            const again = await fetchStrategistVaultMeta(strategist);
            for (let vaultId = 1; vaultId <= Math.max(again.vaultCount, 1); vaultId++) {
              if ((await fetchStrategistVaultMeta(strategist)).activeVaultCount <= 0) break;
              const slot = await classifyVaultSlot(again.programId, strategist, vaultId);
              if (slot.kind === "open") {
                if (selectedIds != null && selectedIds.length > 0 && !selectedIds.includes(vaultId)) {
                  continue;
                }
              } else if (!includeLeftovers) {
                continue;
              }
              await sleep(1400);
              if (await forcePurgeSlot(slot.pubkey, vaultId)) {
                if (!released.some((r) => r.vaultId === vaultId)) {
                  released.push({
                    vaultId,
                    pubkey: slot.pubkey,
                    kind: slot.kind,
                    action: slot.kind === "open" ? "closed" : "cleared",
                  });
                }
              }
            }
            const finalTry = await tryUnlock();
            if (finalTry.ok) return finishOk(finalTry.sig, released);
            if (isActiveVaultsBlock(finalTry.msg)) {
              throw new Error("A vault is still open. Tap Release again to finish closing it.");
            }
            throw new Error(finalTry.msg);
          }
          throw new Error("A vault is still open. Tap Release again to finish closing it.");
        }

        throw new Error(last.msg);
      } catch (e) {
        flowState = {
          status: "failed",
          mode: "close-vault",
          events: flowState.events ?? [],
          error: e instanceof Error ? e.message : String(e),
        };
        await persistFlowState();
        throw e;
      } finally {
        flowJobActive = false;
        flowAbort = null;
      }
    }
    case "SIGN_WIRE": {
      const kp = await requireUnlockedKeypair();
      return { signedTransaction: signWirePartial(message.transactionB64, [kp]) };
    }
    case "PARK_GUEST": {
      const kp = await requireUnlockedKeypair();
      const signature = await runParkGuest({
        investor: kp.publicKey.toBase58(),
        vault: message.vault,
        lamports: message.lamports,
        keypair: kp,
      });
      return { signature };
    }
    case "FLOW_STATE":
      return flowState;
    case "VAULT_POSITIONS": {
      const [posData, tradesData] = await Promise.all([
        listVaultPositions(message.vault),
        listVaultTrades(message.vault).catch(() => ({ items: [] })),
      ]);
      const parsed = parseVaultPositions(posData as Record<string, unknown>);
      return { positions: attachTradeIds(parsed, tradesData.items ?? []) };
    }
    case "SESSION_GET": {
      return chrome.storage.session.get(message.keys);
    }
    case "SESSION_SET": {
      await chrome.storage.session.set(message.values);
      return { saved: true };
    }
    case "FLOW_CANCEL":
      flowAbort?.abort();
      flowAbort = null;
      flowJobActive = false;
      if (flowState.status === "running") {
        flowState = { ...flowState, status: "failed", error: "cancelled" };
        await persistFlowState();
      }
      return flowState;
    case "RUN_FLOW": {
      if (flowState.status === "running") {
        throw new Error("a flow is already running");
      }
      const kp = await requireUnlockedKeypair();
      const pubkey = kp.publicKey.toBase58();

      flowAbort = new AbortController();
      flowJobActive = true;
      flowState = { status: "running", mode: message.mode, events: [] };
      await persistFlowState();

      const input: FlowRunInput = {
        mode: message.mode,
        strategist: pubkey,
        vault: message.vault,
        vaultId: message.vaultId,
        vaultType: message.vaultType,
        vaultName: message.vaultName,
        performanceFeeBps: message.performanceFeeBps,
        earlyExitFeeBps: message.earlyExitFeeBps,
        parkSol: message.parkSol,
        positionId: message.positionId,
        tradeId: message.tradeId,
        inputMint: message.inputMint,
        exitPercent: message.exitPercent,
        shares: message.shares,
        slippageBps: message.slippageBps,
        priorityFeeMicroLamports: message.priorityFeeMicroLamports,
      };

      void runFlow(input, kp, {
        onState: (s) => {
          flowState = s;
          void persistFlowState();
        },
      })
        .catch((e) => {
          if (flowState.status === "running") {
            flowState = {
              ...flowState,
              status: "failed",
              error: e instanceof Error ? e.message : String(e),
            };
            void persistFlowState();
          }
        })
        .finally(() => {
          flowAbort = null;
          flowJobActive = false;
        });

      return flowState;
    }
    default:
      throw new Error(`unknown message ${(message as Msg).type}`);
  }
}
