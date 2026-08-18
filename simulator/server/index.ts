import express from "express";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { INDEXER_API, PORT, RPC_URL } from "./env";
import { loadCliKeypair, parseSecretKey } from "./keys";
import { RpcPool } from "./rpc";
import { runLiveFlow } from "./run-flow";
import type { NodeUpdate, ProtocolInfo, SimMode, WalletPreview } from "../shared/events";

const PROGRAM_ID = "2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP";
const PROTOCOL_CONFIG = "2WXErzw6DEZsVQ2QD3oTcwumCknpzhLf99akKu7qweQR";
const PLATFORM_WALLET = "9YajdkrkvyzDm57bPSijfy6sFNj9wuqQtYmuYUXZtPDx";
const DEGEN_FEE_WALLET = "EXQCB3PJnza9oBNMupBQjVGSuQXaLvTyXNffCJ5zz286";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: "invalid json" });
    return;
  }
  next(err);
});

let running = false;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, rpc: RPC_URL.includes("helius") ? "helius-devnet" : "custom" });
});

app.get("/api/protocol", (_req, res) => {
  const info: ProtocolInfo = {
    cluster: "devnet",
    programId: PROGRAM_ID,
    protocolConfig: PROTOCOL_CONFIG,
    platformWallet: PLATFORM_WALLET,
    degenFeeWallet: DEGEN_FEE_WALLET,
    explorerProgram: `https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`,
  };
  res.json(info);
});

async function previewFromSecret(secret: string): Promise<WalletPreview> {
  const kp = parseSecretKey(secret);
  const rpc = new RpcPool(RPC_URL);
  const lamports = await rpc.retry((c) => c.getBalance(kp.publicKey), 4);
  return {
    pubkey: kp.publicKey.toBase58(),
    sol: (lamports / LAMPORTS_PER_SOL).toFixed(9),
    lamports,
  };
}

app.post("/api/wallet", async (req, res) => {
  try {
    const useCli = Boolean(req.body?.useCli);
    if (useCli) {
      const kp = loadCliKeypair();
      const rpc = new RpcPool(RPC_URL);
      const lamports = await rpc.retry((c) => c.getBalance(kp.publicKey), 4);
      const preview: WalletPreview = {
        pubkey: kp.publicKey.toBase58(),
        sol: (lamports / LAMPORTS_PER_SOL).toFixed(9),
        lamports,
      };
      res.json({ ...preview, cli: true });
      return;
    }
    const secret = String(req.body?.secret ?? "");
    res.json(await previewFromSecret(secret));
  } catch (e) {
    res.status(400).json({ error: String(e).slice(0, 240) });
  }
});

app.post("/api/run", async (req, res) => {
  if (running) {
    res.status(409).json({ error: "A workflow is already running" });
    return;
  }

  let degen;
  let retail;
  try {
    degen = req.body?.degenUseCli
      ? loadCliKeypair()
      : parseSecretKey(String(req.body?.degenSecret ?? ""));
    retail = req.body?.retailUseCli
      ? loadCliKeypair()
      : parseSecretKey(String(req.body?.retailSecret ?? ""));
  } catch (e) {
    res.status(400).json({ error: String(e).slice(0, 240) });
    return;
  }

  running = true;
  console.log(`[run] start ${req.body?.mode ?? "open-position"}`);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const emit = (update: NodeUpdate) => send("node", update);

  try {
    const mode = (req.body?.mode === "create-vault" ? "create-vault" : "open-position") as SimMode;
    const vaultId = Number(req.body?.vaultId);
    send("start", { at: new Date().toISOString(), indexer: INDEXER_API, mode });
    const result = await runLiveFlow({
      rpcUrl: RPC_URL,
      degen,
      retail,
      emit,
      settings: req.body?.settings,
      mode,
      vaultId: Number.isFinite(vaultId) && vaultId > 0 ? vaultId : undefined,
    });
    send("done", { ok: true, mode, ...result });
  } catch (e) {
    send("error", { message: String(e).slice(0, 500) });
  } finally {
    running = false;
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`1Vault simulator API  http://127.0.0.1:${PORT}`);
  console.log(`RPC ${RPC_URL.includes("helius") ? "helius-devnet" : RPC_URL}`);
});
