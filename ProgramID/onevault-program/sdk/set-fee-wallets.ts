import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { RPC_URL } from "./rpc";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const idl = JSON.parse(
  fs.readFileSync(path.join(ROOT, "target/idl/onevault.json"), "utf8")
) as Idl;
const addrPath = path.join(ROOT, "scripts/devnet-addresses.json");
const addr = JSON.parse(fs.readFileSync(addrPath, "utf8"));
const kp = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(
        path.join(os.homedir(), ".config/solana/id.json"),
        "utf8"
      )
    ) as number[]
  )
);
const connection = new Connection(RPC_URL, "confirmed");
const program = new Program(
  idl,
  new AnchorProvider(connection, new Wallet(kp), { commitment: "confirmed" })
);
const treasury = new PublicKey(
  "9YajdkrkvyzDm57bPSijfy6sFNj9wuqQtYmuYUXZtPDx"
);
async function main() {
  const methods = program.methods as Record<string, (...args: unknown[]) => any>;
  const fn = methods.updateProtocolConfig ?? methods.update_protocol_config;
  const sig = await fn(treasury, null, null, null, null, null)
    .accounts({
      authority: kp.publicKey,
      protocolConfig: new PublicKey(addr.protocolConfig),
    })
    .rpc();
  console.log("sig", sig);
  const cfg: any = await (program.account as any).protocolConfig.fetch(
    new PublicKey(addr.protocolConfig)
  );
  console.log("treasury", cfg.treasury.toBase58());
  addr.treasury = treasury.toBase58();
  addr.platformFeeWallet = treasury.toBase58();
  addr.degenFeeWalletRequested =
    "EXQCB3PJnza9oBNMupBQjVGSuQXaLvTyXNffCJ5zz286";
  addr.degenFeeWalletActual = addr.authority;
  fs.writeFileSync(addrPath, JSON.stringify(addr, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
