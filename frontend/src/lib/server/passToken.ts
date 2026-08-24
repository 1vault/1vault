import { SignJWT, jwtVerify } from "jose";
import { jwtSecret } from "./config";

/**
 * Short-lived claims for the shareable Early Pass image. The image endpoint is
 * loaded through an <img> tag, which cannot send an Authorization header, so
 * the pass is addressed by its own signed token instead of the session one.
 */
export type PassClaims = {
  handle: string;
  name: string;
  avatar: string;
  position: number;
  joinedAt: string;
};

function secretKey() {
  return new TextEncoder().encode(jwtSecret());
}

export async function signPassToken(claims: PassClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    // Long lived on purpose: the token addresses a public share page that X
    // re-crawls long after the post goes out, and it grants nothing beyond
    // rendering the card.
    .setExpirationTime("365d")
    .sign(secretKey());
}

export async function verifyPassToken(
  token: string,
): Promise<PassClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const { handle, name, avatar, position, joinedAt } = payload;
    if (typeof handle !== "string" || typeof position !== "number") return null;
    return {
      handle,
      name: typeof name === "string" ? name : handle,
      avatar: typeof avatar === "string" ? avatar : "",
      position,
      joinedAt: typeof joinedAt === "string" ? joinedAt : "",
    };
  } catch {
    return null;
  }
}
