import type { AuthSession, AuthUser } from "./types";

const ACCESS_KEY = "1v-access-token";
const REFRESH_KEY = "1v-refresh-token";
const USER_KEY = "1v-auth-user";

export async function loadStoredSession(): Promise<AuthSession | undefined> {
  try {
    const data = await chrome.storage.local.get([ACCESS_KEY, REFRESH_KEY, USER_KEY]);
    const accessToken = String(data[ACCESS_KEY] ?? "");
    const refreshToken = String(data[REFRESH_KEY] ?? "");
    if (!accessToken || !refreshToken) return undefined;
    const raw = data[USER_KEY];
    const user =
      typeof raw === "string" && raw ? (JSON.parse(raw) as AuthUser) : undefined;
    return { accessToken, refreshToken, user };
  } catch {
    return undefined;
  }
}

export async function saveSession(session: AuthSession): Promise<void> {
  const payload: Record<string, string> = {
    [ACCESS_KEY]: session.accessToken,
    [REFRESH_KEY]: session.refreshToken,
  };
  if (session.user) payload[USER_KEY] = JSON.stringify(session.user);
  await chrome.storage.local.set(payload);
  if (!session.user) await chrome.storage.local.remove(USER_KEY);
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove([ACCESS_KEY, REFRESH_KEY, USER_KEY]);
}
