import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { getProtocol } from "./api/client";
import { LICENSE_LOCK_WHOLE, RPC_URL } from "./config";

const LICENSE_DECIMALS = 6;

export type LicenseStatus = {
  mint: string;
  lockRaw: bigint;
  balanceRaw: bigint;
  hasEnough: boolean;
  lockDisplay: string;
  balanceDisplay: string;
  swapUrl: string;
};

function formatWhole(raw: bigint, decimals = LICENSE_DECIMALS): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  return whole.toLocaleString("en-US");
}

export async function fetchLicenseStatus(walletPubkey: string): Promise<LicenseStatus> {
  const proto = await getProtocol();
  const mint =
    typeof proto.licenseMint === "string" && proto.licenseMint.length > 0
      ? proto.licenseMint
      : "4R9AHfF2wE8X8252Swra3ncvKVDe3m73k8EfP99zz6YK";

  const lockFromProto = proto.licenseLockAmount;
  let lockRaw = BigInt(LICENSE_LOCK_WHOLE) * 10n ** BigInt(LICENSE_DECIMALS);
  if (lockFromProto != null && String(lockFromProto).trim() !== "") {
    try {
      lockRaw = BigInt(String(lockFromProto).replace(/[,\s]/g, ""));
    } catch {
      /* keep default */
    }
  }

  let balanceRaw = 0n;
  try {
    const conn = new Connection(RPC_URL, "confirmed");
    const owner = new PublicKey(walletPubkey);
    const mintPk = new PublicKey(mint);
    const ata = getAssociatedTokenAddressSync(mintPk, owner, false);
    const bal = await conn.getTokenAccountBalance(ata, "confirmed");
    balanceRaw = BigInt(bal.value.amount);
  } catch {
    balanceRaw = 0n;
  }

  const swapUrl = `https://jup.ag/swap/SOL-${mint}`;

  return {
    mint,
    lockRaw,
    balanceRaw,
    hasEnough: balanceRaw >= lockRaw,
    lockDisplay: `${formatWhole(lockRaw)} $1VAULT`,
    balanceDisplay: `${formatWhole(balanceRaw)} $1VAULT`,
    swapUrl,
  };
}
