import { SignJWT, jwtVerify } from "jose";
import { jwtSecret } from "./config";

export type SessionClaims = {
  sub: string;
  twitterId: string;
  handle: string;
};

function secretKey() {
  return new TextEncoder().encode(jwtSecret());
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({
    twitterId: claims.twitterId,
    handle: claims.handle,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifySession(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const sub = payload.sub;
    const twitterId = payload.twitterId;
    const handle = payload.handle;
    if (
      typeof sub !== "string" ||
      typeof twitterId !== "string" ||
      typeof handle !== "string"
    ) {
      return null;
    }
    return { sub, twitterId, handle };
  } catch {
    return null;
  }
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}
