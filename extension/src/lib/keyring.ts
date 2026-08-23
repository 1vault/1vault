import { Keypair } from "@solana/web3.js";
import { parseSecretKey } from "./signing";

const STORAGE_KEY = "1v-keyring-v1";
const IDLE_LOCK_MS = 15 * 60 * 1000;

type StoredBlob = {
  pubkey: string;
  saltB64: string;
  ivB64: string;
  cipherB64: string;
  createdAt: string;
};

type MemorySession = {
  keypair: Keypair;
  unlockedAt: number;
};

let session: MemorySession | null = null;

function b64Encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64Decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 210_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function hasKeyring(): Promise<boolean> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return Boolean(data[STORAGE_KEY]);
}

export async function getStoredPubkey(): Promise<string | null> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const blob = data[STORAGE_KEY] as StoredBlob | undefined;
  return blob?.pubkey ?? null;
}

export function isUnlocked(): boolean {
  if (!session) return false;
  if (Date.now() - session.unlockedAt > IDLE_LOCK_MS) {
    session = null;
    return false;
  }
  return true;
}

export function lock(): void {
  session = null;
}

export function touchSession(): void {
  if (session) session.unlockedAt = Date.now();
}

export function getUnlockedKeypair(): Keypair | null {
  if (!isUnlocked() || !session) return null;
  touchSession();
  return session.keypair;
}

/** Import secret key, encrypt with password, persist. Replaces any existing keyring. */
export async function importAndLock(secretInput: string, password: string): Promise<string> {
  if (password.length < 8) throw new Error("password must be at least 8 characters");
  const keypair = parseSecretKey(secretInput);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    keypair.secretKey as BufferSource
  );
  const blob: StoredBlob = {
    pubkey: keypair.publicKey.toBase58(),
    saltB64: b64Encode(salt),
    ivB64: b64Encode(iv),
    cipherB64: b64Encode(new Uint8Array(cipher)),
    createdAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: blob });
  session = { keypair, unlockedAt: Date.now() };
  return blob.pubkey;
}

export async function unlock(password: string): Promise<string> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const blob = data[STORAGE_KEY] as StoredBlob | undefined;
  if (!blob) throw new Error("no keyring — import a secret key first");
  const salt = b64Decode(blob.saltB64);
  const iv = b64Decode(blob.ivB64);
  const cipher = b64Decode(blob.cipherB64);
  const key = await deriveKey(password, salt);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, cipher as BufferSource);
  } catch {
    throw new Error("wrong password");
  }
  const keypair = Keypair.fromSecretKey(new Uint8Array(plain));
  if (keypair.publicKey.toBase58() !== blob.pubkey) {
    throw new Error("keyring integrity check failed");
  }
  session = { keypair, unlockedAt: Date.now() };
  return blob.pubkey;
}

export async function clearKeyring(): Promise<void> {
  session = null;
  await chrome.storage.local.remove(STORAGE_KEY);
}
