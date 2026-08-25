import bs58 from "bs58";
import nacl from "tweetnacl";
import { bindWallet, getWalletNonce } from "../api/client";
import type { AuthSession } from "./types";
import { refreshAuthSession } from "./index";

export async function bindWalletWithKeypair(
  session: AuthSession,
  pubkey: string,
  signMessage: (message: string) => Promise<string>,
  rolePreference: "strategies" | "investors" = "strategies",
  primary = true
): Promise<AuthSession> {
  const nonceRes = await getWalletNonce(pubkey, session.accessToken);
  const signature = await signMessage(nonceRes.message);
  await bindWallet(session.accessToken, {
    pubkey,
    nonce: nonceRes.nonce,
    signature,
    rolePreference,
    primary,
  });
  return refreshAuthSession(session.refreshToken);
}

export function signBindMessageWithSecret(secretKey: Uint8Array, message: string): string {
  const bytes = new TextEncoder().encode(message);
  return bs58.encode(nacl.sign.detached(bytes, secretKey));
}
