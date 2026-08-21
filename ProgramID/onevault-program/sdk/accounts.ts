import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

/** Investor vault share ATA (must exist before mirror / deposit). */
export function investorShareAta(shareMint: PublicKey, investor: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(shareMint, investor);
}

/** Strategist parked share ATA (required for request_trade). */
export function strategistShareAta(shareMint: PublicKey, strategist: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(shareMint, strategist);
}
