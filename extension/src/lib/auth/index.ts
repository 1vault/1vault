import { api } from "../api/client";
import type { AuthSession, AuthUser } from "./types";
import { clearSession, loadStoredSession, saveSession } from "./session";

export type { AuthSession, AuthUser } from "./types";

function oauthRedirectUrl(): string {
  return `https://${chrome.runtime.id}.chromiumapp.org/`;
}

function parseTokensFromUrl(responseUrl: string): { accessToken: string; refreshToken: string } {
  const hash = new URL(responseUrl).hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const accessToken = params.get("accessToken") ?? "";
  const refreshToken = params.get("refreshToken") ?? "";
  if (!accessToken || !refreshToken) {
    throw new Error("Missing tokens in OAuth redirect — check backend CORS_ORIGINS includes your extension redirect URL");
  }
  return { accessToken, refreshToken };
}

export async function fetchAuthMe(accessToken: string): Promise<AuthUser> {
  return api<AuthUser>("/v1/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Opens Twitter OAuth via backend; stores JWT in chrome.storage.local. */
export async function startTwitterLogin(): Promise<AuthSession> {
  const returnTo = oauthRedirectUrl();
  const start = await api<{ url?: string }>("/v1/auth/twitter/start", {
    query: { returnTo },
  });
  if (!start.url) {
    throw new Error("Twitter OAuth URL missing — check TWITTER_CLIENT_ID on backend");
  }

  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: start.url!, interactive: true }, (redirectedTo) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message ?? "OAuth cancelled"));
      else if (!redirectedTo) reject(new Error("OAuth returned empty redirect"));
      else resolve(redirectedTo);
    });
  });

  const tokens = parseTokensFromUrl(responseUrl);
  const user = await fetchAuthMe(tokens.accessToken);
  const session: AuthSession = { ...tokens, user };
  await saveSession(session);
  return session;
}

export async function refreshAuthSession(refreshToken: string): Promise<AuthSession> {
  const data = await api<{ accessToken: string; refreshToken: string }>("/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
  const session: AuthSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: (await loadStoredSession())?.user,
  };
  if (session.accessToken) {
    try {
      session.user = await fetchAuthMe(session.accessToken);
    } catch {
      /* keep cached user */
    }
  }
  await saveSession(session);
  return session;
}

export async function logoutAuth(refreshToken?: string): Promise<void> {
  if (refreshToken) {
    try {
      await api("/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      /* clear local either way */
    }
  }
  await clearSession();
}

export function formatXHandle(user?: AuthUser): string {
  if (!user?.handle) return "";
  return user.handle.startsWith("@") ? user.handle : `@${user.handle}`;
}

export function displayXName(user?: AuthUser): string {
  if (!user) return "Not signed in";
  return user.displayName?.trim() || formatXHandle(user) || "X account";
}

/** Role for the linked wallet pubkey (from backend user_wallets). */
export function roleLabelForWallet(user: AuthUser | undefined, pubkey: string | null): string | null {
  if (!user || !pubkey) return null;
  const wallet = user.wallets?.find((w) => w.pubkey === pubkey);
  const role = wallet?.rolePreference ?? "";
  if (role === "strategies" || role === "strategist" || role === "degen") return "Strategist";
  if (role === "investors" || role === "retail" || role === "investor") return "Investor";
  return null;
}

/** Allowed OAuth redirect origin — add to backend CORS_ORIGINS on Railway. */
export function oauthRedirectOrigin(): string {
  return oauthRedirectUrl().replace(/\/$/, "");
}

export { loadStoredSession, saveSession, clearSession } from "./session";
