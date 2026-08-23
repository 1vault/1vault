import type { AuthSession, AuthUser } from "../shared/events";
import { parseSecretKey } from "./keys";
import { apiUrl, readJson } from "./http";
import bs58 from "bs58";
import nacl from "tweetnacl";

const ACCESS_KEY = "1v-access-token";
const REFRESH_KEY = "1v-refresh-token";
const USER_KEY = "1v-auth-user";

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: { message?: string; code?: string };
};

function appOrigin(): string {
  if (typeof window === "undefined") return "http://localhost:5174";
  return window.location.origin;
}

function callbackUrl(): string {
  return `${appOrigin()}/auth/callback`;
}

export function loadStoredSession(): AuthSession | undefined {
  try {
    const accessToken = localStorage.getItem(ACCESS_KEY) ?? "";
    const refreshToken = localStorage.getItem(REFRESH_KEY) ?? "";
    if (!accessToken || !refreshToken) return undefined;
    const raw = localStorage.getItem(USER_KEY);
    const user = raw ? (JSON.parse(raw) as AuthUser) : undefined;
    return { accessToken, refreshToken, user };
  } catch {
    return undefined;
  }
}

export function saveSession(session: AuthSession): void {
  localStorage.setItem(ACCESS_KEY, session.accessToken);
  localStorage.setItem(REFRESH_KEY, session.refreshToken);
  if (session.user) localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  else localStorage.removeItem(USER_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  const json = await readJson<ApiEnvelope<T>>(res);
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message ?? `request failed (${res.status})`);
  }
  return json.data as T;
}

export async function fetchAuthMe(accessToken: string): Promise<AuthUser> {
  return api<AuthUser>("/v1/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function startTwitterLogin(): Promise<void> {
  const returnTo = encodeURIComponent(callbackUrl());
  const data = await api<{ url?: string }>(`/v1/auth/twitter/start?returnTo=${returnTo}`);
  if (!data.url) throw new Error("Twitter OAuth URL missing — check TWITTER_CLIENT_ID on backend");
  window.location.href = data.url;
}

export function parseCallbackTokens(): { accessToken: string; refreshToken: string } | undefined {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  const accessToken = params.get("accessToken") ?? "";
  const refreshToken = params.get("refreshToken") ?? "";
  if (!accessToken || !refreshToken) return undefined;
  return { accessToken, refreshToken };
}

export async function completeCallbackLogin(): Promise<AuthSession> {
  const tokens = parseCallbackTokens();
  if (!tokens) throw new Error("Missing accessToken or refreshToken in callback URL");
  const user = await fetchAuthMe(tokens.accessToken);
  const session: AuthSession = { ...tokens, user };
  saveSession(session);
  return session;
}

export async function refreshAuthSession(refreshToken: string): Promise<AuthSession> {
  const data = await api<{ accessToken: string; refreshToken: string }>("/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const session: AuthSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: loadStoredSession()?.user,
  };
  if (session.accessToken) {
    try {
      session.user = await fetchAuthMe(session.accessToken);
    } catch {
      /* keep cached user */
    }
  }
  saveSession(session);
  return session;
}

export async function logoutAuth(refreshToken?: string): Promise<void> {
  if (refreshToken) {
    try {
      await api("/v1/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      /* clear local either way */
    }
  }
  clearSession();
}

type WalletSigner =
  | { mode: "secret"; secret: string; pubkey: string }
  | { mode: "wallet"; pubkey: string };

async function signBindMessage(signer: WalletSigner, message: string): Promise<string> {
  const bytes = new TextEncoder().encode(message);
  if (signer.mode === "secret") {
    const kp = parseSecretKey(signer.secret);
    if (kp.publicKey.toBase58() !== signer.pubkey) {
      throw new Error("Secret key does not match wallet pubkey");
    }
    return bs58.encode(nacl.sign.detached(bytes, kp.secretKey));
  }
  const w = window as Window & {
    solana?: { publicKey?: { toBase58(): string }; signMessage?(msg: Uint8Array, enc: string): Promise<{ signature: Uint8Array }> };
    solflare?: { publicKey?: { toBase58(): string }; signMessage?(msg: Uint8Array, enc: string): Promise<{ signature: Uint8Array }> };
  };
  const injected = w.solana?.signMessage ? w.solana : w.solflare;
  if (!injected?.publicKey || !injected.signMessage) {
    throw new Error("Wallet does not support signMessage — use private key import to bind");
  }
  if (injected.publicKey.toBase58() !== signer.pubkey) {
    throw new Error("Connected wallet does not match pubkey");
  }
  const { signature } = await injected.signMessage(bytes, "utf8");
  return bs58.encode(signature);
}

/** Link Solana wallet to X user (stores pubkey in user_wallets). */
export async function bindWallet(opts: {
  accessToken: string;
  pubkey: string;
  rolePreference: "strategies" | "investors";
  signer: WalletSigner;
  primary?: boolean;
}): Promise<void> {
  const nonceRes = await api<{ nonce: string; message: string }>(
    `/v1/wallets/nonce?pubkey=${encodeURIComponent(opts.pubkey)}`,
    { headers: { Authorization: `Bearer ${opts.accessToken}` } }
  );
  const signature = await signBindMessage(opts.signer, nonceRes.message);
  await api("/v1/wallets/bind", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pubkey: opts.pubkey,
      nonce: nonceRes.nonce,
      signature,
      rolePreference: opts.rolePreference,
      primary: opts.primary ?? false,
    }),
  });
}

export function formatXHandle(user?: AuthUser): string {
  if (!user?.handle) return "";
  return user.handle.startsWith("@") ? user.handle : `@${user.handle}`;
}
