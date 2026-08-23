export type VaultPositionRow = {
  positionId: number;
  tradeId: number;
  inputMint: string;
  outputMint: string;
  entryValue: string;
  currentValue: string;
  status: string;
};

function num(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== "") return Number(v) || 0;
  }
  return 0;
}

function str(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v) !== "") return String(v);
  }
  return "";
}

export function parseVaultPositions(data: Record<string, unknown>): VaultPositionRow[] {
  const raw = (data.vault ?? data.items ?? data.positions ?? []) as Array<Record<string, unknown>>;
  return raw
    .map((p) => ({
      positionId: num(p, "position_id", "positionId"),
      tradeId: 0,
      inputMint: str(p, "input_mint", "inputMint"),
      outputMint: str(p, "output_mint", "outputMint"),
      entryValue: str(p, "entry_value", "entryValue") || "0",
      currentValue: str(p, "current_value", "currentValue") || "0",
      status: str(p, "status") || "open",
    }))
    .filter((p) => p.positionId > 0 && p.status === "open");
}

export function attachTradeIds(
  positions: VaultPositionRow[],
  trades: Array<Record<string, unknown>>
): VaultPositionRow[] {
  return positions.map((pos) => ({
    ...pos,
    tradeId: resolveTradeIdForPosition(pos, trades),
  }));
}

export function resolveTradeIdForPosition(
  position: VaultPositionRow,
  trades: Array<Record<string, unknown>>
): number {
  const heldMint = position.outputMint;
  if (heldMint) {
    const match = trades.find((t) => {
      const out = str(t, "output_mint", "outputMint");
      const status = str(t, "status").toLowerCase();
      return out === heldMint && (status === "executed" || status === "confirmed" || status === "filled");
    });
    if (match) {
      const id = num(match, "trade_id", "tradeId");
      if (id > 0) return id;
    }
  }

  let max = 0;
  for (const t of trades) {
    const id = num(t, "trade_id", "tradeId");
    if (id > max) max = id;
  }
  return max > 0 ? max : position.positionId;
}
