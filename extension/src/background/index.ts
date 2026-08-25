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
  restoreSession,
  unlock,
} from "../lib/keyring";
import { getHealth, getProtocol, getStrategist, listVaults } from "../lib/api";
import { estimatePipeline, estimateParkBreakdown } from "../lib/estimate";
import { runFlow, type FlowMode, type FlowRunInput, type FlowState } from "../lib/flow";
import { indexerHealth } from "../lib/indexer/client";
import { signWirePartial } from "../lib/signing";
import { clearSession } from "../lib/auth";
import { annotateVaultLayout } from "../lib/vault-layout";
import { RPC_URL } from "../lib/config";
import { runParkGuest } from "../lib/investor-tx";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { runUnlockLicense } from "../lib/tx-run";

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
  | { type: "PARK_BREAKDOWN"; vault: string; walletPubkey?: string }
  | { type: "WALLET_BALANCE"; pubkey?: string }
  | { type: "SIGN_BIND_MESSAGE"; message: string }
  | { type: "UNLOCK_LICENSE"; strategist: string }
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
      parkSol?: number;
      positionId?: number;
      tradeId?: number;
      inputMint?: string;
      exitPercent?: number;
      shares?: number | string;
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
  // MV3 SW may restart and wipe in-memory session — restore first.
  await restoreSession();

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
      const kp = getUnlockedKeypair();
      if (!kp) throw new Error("keyring locked — unlock wallet password first");
      const bytes = new TextEncoder().encode(message.message);
      return { signature: bs58.encode(nacl.sign.detached(bytes, kp.secretKey)) };
    }
    case "UNLOCK_LICENSE": {
      const kp = getUnlockedKeypair();
      if (!kp) throw new Error("keyring locked — unlock wallet password first");
      const sig = await runUnlockLicense(message.strategist, kp);
      return { signature: sig };
    }
    case "SIGN_WIRE": {
      const kp = getUnlockedKeypair();
      if (!kp) throw new Error("keyring locked — unlock wallet password first");
      return { signedTransaction: signWirePartial(message.transactionB64, [kp]) };
    }
    case "PARK_GUEST": {
      const kp = getUnlockedKeypair();
      if (!kp) throw new Error("keyring locked — unlock wallet password first");
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
      if (!kp || !pubkey) throw new Error("keyring locked — unlock wallet password first");

      flowAbort = new AbortController();
      flowState = { status: "running", mode: message.mode, events: [] };
      await persistFlowState();

      const input: FlowRunInput = {
        mode: message.mode,
        strategist: pubkey,
        vault: message.vault,
        vaultId: message.vaultId,
        vaultType: message.vaultType,
        vaultName: message.vaultName,
        parkSol: message.parkSol,
        positionId: message.positionId,
        tradeId: message.tradeId,
        inputMint: message.inputMint,
        exitPercent: message.exitPercent,
        shares: message.shares,
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
