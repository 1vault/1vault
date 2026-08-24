import { twitterCallbackUrl, twitterClientId, twitterClientSecret } from "./config";

export type TwitterUser = {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
};

export function buildTwitterAuthUrl(
  state: string,
  challenge: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: twitterClientId(),
    redirect_uri: twitterCallbackUrl(),
    scope: "tweet.read users.read offline.access",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `https://x.com/i/oauth2/authorize?${params.toString()}`;
}

export async function exchangeTwitterCode(
  code: string,
  verifier: string,
): Promise<string> {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: twitterClientId(),
    redirect_uri: twitterCallbackUrl(),
    code_verifier: verifier,
  });

  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${twitterClientId()}:${twitterClientSecret()}`).toString("base64")}`,
    },
    body,
  });

  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error ?? `Twitter token exchange failed (${res.status})`);
  }
  return json.access_token;
}

export async function fetchTwitterMe(
  accessToken: string,
): Promise<TwitterUser> {
  const res = await fetch(
    "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const json = (await res.json()) as { data?: TwitterUser; detail?: string };
  if (!res.ok || !json.data) {
    throw new Error(json.detail ?? `Twitter /me failed (${res.status})`);
  }
  return json.data;
}
