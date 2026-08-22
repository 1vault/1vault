import { Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

export function parseSecretKey(input: string): Keypair {
  const raw = input.trim();
  if (!raw) throw new Error("empty secret");

  if (raw.startsWith("[")) {
    const nums = JSON.parse(raw) as number[];
    if (!Array.isArray(nums) || nums.length < 32) {
      throw new Error("invalid JSON secret key");
    }
    return Keypair.fromSecretKey(Uint8Array.from(nums));
  }

  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length >= 64) {
    const bytes = new Uint8Array(raw.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    }
    return Keypair.fromSecretKey(bytes);
  }

  return Keypair.fromSecretKey(bs58.decode(raw));
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function writeShortu16(value: number): Uint8Array {
  const out: number[] = [];
  let n = value;
  for (;;) {
    let b = n & 0x7f;
    n >>= 7;
    if (n === 0) {
      out.push(b);
      break;
    }
    out.push(b | 0x80);
  }
  return Uint8Array.from(out);
}

/** Compact-u16 used by Solana shortvec encoding. */
function readShortu16(bytes: Uint8Array, offset: number): { value: number; size: number } {
  let value = 0;
  let size = 0;
  for (;;) {
    const b = bytes[offset + size];
    if (b === undefined) throw new Error("truncated shortu16");
    value |= (b & 0x7f) << (size * 7);
    size += 1;
    if ((b & 0x80) === 0) break;
    if (size > 3) throw new Error("invalid shortu16");
  }
  return { value, size };
}

function readPubkey(bytes: Uint8Array, offset: number): string {
  return bs58.encode(bytes.slice(offset, offset + 32));
}

/**
 * gagliardetto MarshalBinary on unsigned txs writes numSignatures=0 then the message.
 * Pad empty 64-byte signature slots so wire count matches message header.
 */
export function ensureSignatureSlots(bytes: Uint8Array): Uint8Array {
  const { value: wireSigs, size: nSize } = readShortu16(bytes, 0);
  const tentativeMsgStart = nSize + wireSigs * 64;
  if (tentativeMsgStart >= bytes.length) throw new Error("truncated transaction");
  const msg = bytes.slice(tentativeMsgStart);
  const numRequired = msg[0];
  if (numRequired < 1 || numRequired > 16) {
    throw new Error(`invalid numRequiredSignatures=${numRequired}`);
  }
  if (wireSigs === numRequired) return bytes;
  if (wireSigs !== 0) {
    throw new Error(`sig count mismatch header=${numRequired} wire=${wireSigs}`);
  }
  // Rebuild: compact(numRequired) + zero sigs + original message
  const count = writeShortu16(numRequired);
  const out = new Uint8Array(count.length + numRequired * 64 + msg.length);
  out.set(count, 0);
  // zeros already
  out.set(msg, count.length + numRequired * 64);
  return out;
}

/**
 * Partial-sign a prepared legacy tx WITHOUT recompiling the message.
 * web3.js Transaction.partialSign() calls compileMessage() which rewrites
 * account order / message bytes and breaks server co-sign verification.
 */
export function signWirePartial(b64: string, signers: Keypair[]): string {
  const bytes = ensureSignatureSlots(b64ToBytes(b64));
  const { value: numSigs, size: nSize } = readShortu16(bytes, 0);
  const sigStart = nSize;
  const msgStart = sigStart + numSigs * 64;
  const msg = bytes.slice(msgStart);
  const { value: numAccounts, size: accSize } = readShortu16(msg, 3);
  const accountsOffset = 3 + accSize;
  const byPub = new Map(signers.map((k) => [k.publicKey.toBase58(), k]));

  const out = new Uint8Array(bytes);
  for (let i = 0; i < numSigs && i < numAccounts; i++) {
    const pk = readPubkey(msg, accountsOffset + i * 32);
    const kp = byPub.get(pk);
    if (!kp) continue;
    const sig = nacl.sign.detached(msg, kp.secretKey);
    out.set(sig, sigStart + i * 64);
  }
  return bytesToB64(out);
}

export function signPreparedEOA(
  b64: string,
  details: Array<{ pubkey: string; userMustSign?: boolean }>,
  keyByPub: Map<string, Keypair>
): string {
  const eoaOnly = details.some((d) => d.userMustSign === false)
    ? details.filter((d) => d.userMustSign === true)
    : details.filter((d) => d.userMustSign !== false);
  const list = eoaOnly.length > 0 ? eoaOnly : details;
  if (list.length === 0) throw new Error("no EOA signer in prepared tx");
  const kps: Keypair[] = [];
  for (const d of list) {
    const kp = keyByPub.get(d.pubkey);
    if (!kp) throw new Error(`no local key for ${d.pubkey}`);
    kps.push(kp);
  }
  return signWirePartial(b64, kps);
}

type SolanaWallet = {
  publicKey?: { toBase58(): string };
  signTransaction(tx: Transaction): Promise<Transaction>;
};

function getInjectedWallet(): SolanaWallet | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { solana?: SolanaWallet & { isPhantom?: boolean }; solflare?: SolanaWallet };
  if (w.solana?.isPhantom) return w.solana;
  if (w.solflare) return w.solflare;
  return w.solana ?? null;
}

/**
 * External wallet path (Phantom/Solflare). Wallet may recompile the message;
 * backend MergePartial co-signs ephemeral over the returned wire bytes.
 */
export async function signWithExternalWallet(b64: string, expectedPubkey: string): Promise<string> {
  const wallet = getInjectedWallet();
  if (!wallet?.publicKey || !wallet.signTransaction) {
    throw new Error("Phantom/Solflare not connected");
  }
  const connected = wallet.publicKey.toBase58();
  if (connected !== expectedPubkey) {
    throw new Error(
      `Connected wallet is ${connected.slice(0, 4)}… — switch to ${expectedPubkey.slice(0, 4)}… for this step`
    );
  }
  const padded = ensureSignatureSlots(b64ToBytes(b64));
  const tx = Transaction.from(padded);
  const signed = await wallet.signTransaction(tx);
  return bytesToB64(
    signed.serialize({ requireAllSignatures: false, verifySignatures: false })
  );
}

export function solToLamports(sol: number): number {
  return Math.max(0, Math.floor(sol * LAMPORTS_PER_SOL));
}
