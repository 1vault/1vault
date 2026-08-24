import {
  clearKeyring,
  getStoredPubkey,
  getUnlockedKeypair,
  hasKeyring,
  importAndLock,
  isUnlocked,
  lock,
  unlock,
} from "../lib/keyring";
import { getHealth, getProtocol, getStrategist, listVaults } from "../lib/api";
import { estimatePipeline } from "../lib/estimate";
import { runFlow, type FlowMode, type FlowRunInput, type FlowState } from "../lib/flow";
import { indexerHealth } from "../lib/indexer/client";
import { signWirePartial } from "../lib/signing";
import { clearSession } from "../lib/auth";
import { annotateVaultLayout } from "../lib/vault-layout";

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
  | { type: "MY_VAULTS" }
  | { type: "PIPELINE"; vault: string }
  | { type: "SIGN_WIRE"; transactionB64: string }
  | {
      type: "RUN_FLOW";
      mode: FlowMode;
      vault?: string;
      vaultId?: number;
      vaultType?: "pooled" | "sliced";
      parkSol?: number;
      positionId?: number;
      tradeId?: number;
      inputMint?: string;
      exitPercent?: number;
    }
  | { type: "OPEN_SIDE_PANEL" }
  | { type: "FLOW_STATE" }
  | { type: "FLOW_CANCEL" };

export type MsgResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

const FLOW_STORAGE_KEY = "flowState";

let flowState: FlowState = { status: "idle", events: [] };
let flowAbort: AbortController | null = null;

async function persistFlowState() {
  await chrome.storage.session.set({ [FLOW_STORAGE_KEY]: flowState });
}

async function loadFlowState() {
  const stored = await chrome.storage.session.get(FLOW_STORAGE_KEY);
  if (stored[FLOW_STORAGE_KEY]) {
    flowState = stored[FLOW_STORAGE_KEY] as FlowState;
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
      lock();
      return { unlocked: false };
    case "KEYRING_CLEAR":
      await clearKeyring();
      return { cleared: true };
    case "LOGOUT_ALL":
      lock();
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
      const vaults = (strat.vaults?.length ? strat.vaults : listed.items) ?? [];
      const annotated = await annotateVaultLayout(vaults).catch(() =>
        vaults.map((v) => ({
          ...v,
          layoutCompatible: false,
          canPark: false,
          canClose: false,
          vaultStatus: "Unknown",
        }))
      );
      return { pubkey, vaults: annotated, protocol };
    }
    case "PIPELINE":
      return estimatePipeline(message.vault);
    case "SIGN_WIRE": {
      const kp = getUnlockedKeypair();
      if (!kp) throw new Error("keyring locked — unlock first");
      return { signedTransaction: signWirePartial(message.transactionB64, [kp]) };
    }
    case "FLOW_STATE":
      return flowState;
    case "FLOW_CANCEL":
      flowAbort?.abort();
      flowAbort = null;
      if (flowState.status === "running") {
        flowState = { ...flowState, status: "failed", error: "cancelled" };
        await persistFlowState();
      }
      return flowState;
    case "RUN_FLOW": {
      if (flowState.status === "running") {
        throw new Error("a flow is already running");
      }
      const kp = getUnlockedKeypair();
      const pubkey = kp?.publicKey.toBase58() ?? (await getStoredPubkey());
      if (!kp || !pubkey) throw new Error("keyring locked — unlock first");

      flowAbort = new AbortController();
      flowState = { status: "running", mode: message.mode, events: [] };
      await persistFlowState();

      const input: FlowRunInput = {
        mode: message.mode,
        strategist: pubkey,
        vault: message.vault,
        vaultId: message.vaultId,
        vaultType: message.vaultType,
        parkSol: message.parkSol,
        positionId: message.positionId,
        tradeId: message.tradeId,
        inputMint: message.inputMint,
        exitPercent: message.exitPercent,
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
        });

      return flowState;
    }
    default:
      throw new Error(`unknown message ${(message as Msg).type}`);
  }
}
