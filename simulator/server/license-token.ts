import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import type { RpcPool } from "./rpc";

export const LICENSE_NAME = "1vault Licence";
export const LICENSE_SYMBOL = "1VL";
export const LICENSE_LOCK_TOKENS = 1_000_000n;
export const LICENSE_DECIMALS = 6;
export const LICENSE_LOCK_RAW = LICENSE_LOCK_TOKENS * 10n ** BigInt(LICENSE_DECIMALS);

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export function metadataPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function borshString(value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

export function createMetadataV3Ix(opts: {
  mint: PublicKey;
  mintAuthority: PublicKey;
  payer: PublicKey;
  name: string;
  symbol: string;
  uri?: string;
}): TransactionInstruction {
  const metadata = metadataPda(opts.mint);
  const data = Buffer.concat([
    Buffer.from([33]),
    borshString(opts.name),
    borshString(opts.symbol),
    borshString(opts.uri ?? ""),
    Buffer.from([0, 0]),
    Buffer.from([0]),
    Buffer.from([0]),
    Buffer.from([0]),
    Buffer.from([1]),
    Buffer.from([0]),
  ]);
  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: opts.mint, isSigner: false, isWritable: false },
      { pubkey: opts.mintAuthority, isSigner: true, isWritable: false },
      { pubkey: opts.payer, isSigner: true, isWritable: true },
      { pubkey: opts.mintAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function formatLicenseAmount(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  return `${whole.toLocaleString("en-US")} ${LICENSE_NAME}`;
}

type SendAndPoll = (rpc: RpcPool, tx: Transaction, signers: Keypair[]) => Promise<string>;

export async function ensureLicenseTokens(opts: {
  rpc: RpcPool;
  payer: Keypair;
  mint: PublicKey;
  lockRaw: bigint;
  sendAndPoll: SendAndPoll;
}): Promise<{
  ata: PublicKey;
  balance: bigint;
  decimals: number;
  mintTx?: string;
  metadataTx?: string;
}> {
  const { rpc, payer, mint, lockRaw, sendAndPoll } = opts;
  const mintInfo = await rpc.retry((c) => getMint(c, mint));
  const ata = getAssociatedTokenAddressSync(mint, payer.publicKey);
  const setup = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      ata,
      payer.publicKey,
      mint,
      TOKEN_PROGRAM_ID
    )
  );
  await sendAndPoll(rpc, setup, [payer]);

  let mintTx: string | undefined;
  const authority = mintInfo.mintAuthority;
  if (authority && authority.equals(payer.publicKey)) {
    const current = await tokenBalance(rpc, ata);
    if (current < lockRaw) {
      const tx = new Transaction().add(
        createMintToInstruction(mint, ata, payer.publicKey, lockRaw - current)
      );
      mintTx = await sendAndPoll(rpc, tx, [payer]);
    }
  }

  let metadataTx: string | undefined;
  const md = metadataPda(mint);
  if (authority && authority.equals(payer.publicKey) && !(await rpc.retry((c) => c.getAccountInfo(md)))) {
    try {
      const tx = new Transaction().add(
        createMetadataV3Ix({
          mint,
          mintAuthority: payer.publicKey,
          payer: payer.publicKey,
          name: LICENSE_NAME,
          symbol: LICENSE_SYMBOL,
        })
      );
      metadataTx = await sendAndPoll(rpc, tx, [payer]);
    } catch {
      /* metadata is optional — SPL mint still works without it */
    }
  }

  return {
    ata,
    balance: await tokenBalance(rpc, ata),
    decimals: mintInfo.decimals,
    mintTx,
    metadataTx,
  };
}

async function tokenBalance(rpc: RpcPool, ata: PublicKey): Promise<bigint> {
  try {
    const info = await rpc.retry((c) => c.getTokenAccountBalance(ata));
    return BigInt(info.value.amount);
  } catch {
    return 0n;
  }
}
