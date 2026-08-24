import { createHash, randomBytes } from "node:crypto";

export function randomUrl(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomUrl(32);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
