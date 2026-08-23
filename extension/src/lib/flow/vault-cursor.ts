/** Read next_trade_id / next_position_id from on-chain Vault account. */
export async function fetchVaultTradeCursor(
  rpcUrl: string,
  vaultPubkey: string
): Promise<{ tradeId: number; positionId: number }> {
  const { Connection, PublicKey } = await import("@solana/web3.js");
  const conn = new Connection(rpcUrl, "confirmed");
  const info = await conn.getAccountInfo(new PublicKey(vaultPubkey), "confirmed");
  if (!info?.data?.length) {
    throw new Error(`vault ${vaultPubkey} not found on-chain`);
  }
  const d = info.data;
  let o = 8;
  const skipStr = () => {
    const n = d.readUInt32LE(o);
    o += 4 + n;
  };
  o += 32 + 8;
  skipStr();
  skipStr();
  o += 32 + 1 + 32 * 5 + 32 + 32;
  o += 8 * 4;
  o += 2 + 1 + 2;
  o += 1 + 2 + 1 + 1;
  const tradeId = Number(d.readBigUInt64LE(o)) || 1;
  const positionId = Number(d.readBigUInt64LE(o + 8)) || 1;
  return { tradeId, positionId };
}

function u64LE(id: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(id), true);
  return buf;
}

function tradePDA(
  PublicKey: typeof import("@solana/web3.js").PublicKey,
  program: import("@solana/web3.js").PublicKey,
  vault: import("@solana/web3.js").PublicKey,
  tradeId: number
) {
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("trade"), vault.toBuffer(), u64LE(tradeId)],
    program
  );
  return pda;
}

function vaultPositionPDA(
  PublicKey: typeof import("@solana/web3.js").PublicKey,
  program: import("@solana/web3.js").PublicKey,
  vault: import("@solana/web3.js").PublicKey,
  positionId: number
) {
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("vault_position"), vault.toBuffer(), u64LE(positionId)],
    program
  );
  return pda;
}

export async function detectExecutedTradeResume(
  rpcUrl: string,
  vaultPubkey: string,
  programId: string
): Promise<{ tradeId: number; positionId: number } | null> {
  const cursor = await fetchVaultTradeCursor(rpcUrl, vaultPubkey);
  if (cursor.tradeId <= 1) return null;
  const tradeId = cursor.tradeId - 1;
  const positionId = cursor.positionId;

  const { Connection, PublicKey } = await import("@solana/web3.js");
  const conn = new Connection(rpcUrl, "confirmed");
  const vault = new PublicKey(vaultPubkey);
  const program = new PublicKey(programId);

  const tradeAcc = await conn.getAccountInfo(tradePDA(PublicKey, program, vault, tradeId), "confirmed");
  if (!tradeAcc?.data || tradeAcc.data.length < 178) return null;
  if (tradeAcc.data[177] !== 1) return null;

  const posAcc = await conn.getAccountInfo(vaultPositionPDA(PublicKey, program, vault, positionId), "confirmed");
  if (posAcc) return null;

  return { tradeId, positionId };
}
