import { api } from "./api";

export type AuthUser = {
  id: string;
  twitterId: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user?: AuthUser;
};

export type WaitlistStatus = {
  joined: boolean;
  handle?: string;
  position?: number;
  joinedAt?: string;
  status?: "joined" | "existing";
};

const ACCESS_KEY = "1v-access-token";
const REFRESH_KEY = "1v-refresh-token";
const USER_KEY = "1v-auth-user";
const WAITLIST_KEY = "1v-waitlist";

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
  localStorage.removeItem(WAITLIST_KEY);
}

export function loadCachedWaitlist(): WaitlistStatus | undefined {
  try {
    const raw = localStorage.getItem(WAITLIST_KEY);
    return raw ? (JSON.parse(raw) as WaitlistStatus) : undefined;
  } catch {
    return undefined;
  }
}

export function saveCachedWaitlist(status: WaitlistStatus): void {
  localStorage.setItem(WAITLIST_KEY, JSON.stringify(status));
}

export async function fetchAuthMe(accessToken: string): Promise<AuthUser> {
  return api<AuthUser>("/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function startTwitterLogin(): void {
  window.location.href = "/api/auth/twitter/start";
}

export function parseCallbackPayload():
  | {
      accessToken: string;
      refreshToken: string;
      waitlist: WaitlistStatus;
      user?: Partial<AuthUser>;
    }
  | undefined {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const accessToken = params.get("accessToken") ?? "";
  const refreshToken = params.get("refreshToken") ?? "";
  const waitlistHandle = params.get("waitlistHandle") ?? "";
  const waitlistPosition = params.get("waitlistPosition");
  const waitlistStatus = params.get("waitlistStatus") as
    | "joined"
    | "existing"
    | null;

  if (!accessToken || !refreshToken || !waitlistHandle || !waitlistPosition) {
    return undefined;
  }

  return {
    accessToken,
    refreshToken,
    waitlist: {
      joined: true,
      handle: waitlistHandle,
      position: Number(waitlistPosition),
      status: waitlistStatus ?? "joined",
    },
    user: {
      handle: waitlistHandle,
      displayName: params.get("displayName") ?? undefined,
      avatarUrl: params.get("avatarUrl") ?? undefined,
    },
  };
}

export function parseCallbackError(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("error") ?? undefined;
}

export async function fetchWaitlistMe(accessToken: string): Promise<WaitlistStatus> {
  const data = await api<WaitlistStatus>("/api/waitlist/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (data.joined) saveCachedWaitlist(data);
  return data;
}

export async function completeCallbackLogin(): Promise<{
  session: AuthSession;
  waitlist: WaitlistStatus;
}> {
  const oauthError = parseCallbackError();
  if (oauthError) {
    throw new Error(oauthError);
  }

  const payload = parseCallbackPayload();
  if (!payload) {
    throw new Error("Missing session data in callback URL.");
  }

  let user: AuthUser | undefined;
  try {
    user = await fetchAuthMe(payload.accessToken);
  } catch {
    user = payload.user?.handle
      ? {
          id: "",
          twitterId: "",
          handle: payload.user.handle,
          displayName: payload.user.displayName,
          avatarUrl: payload.user.avatarUrl,
        }
      : undefined;
  }

  const session: AuthSession = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user,
  };
  saveSession(session);
  saveCachedWaitlist(payload.waitlist);

  return { session, waitlist: payload.waitlist };
}

export function formatXHandle(user?: AuthUser | WaitlistStatus): string {
  const handle = user && "handle" in user ? user.handle : undefined;
  if (!handle) return "";
  return handle.startsWith("@") ? handle : `@${handle}`;
}
