import { useCallback, useEffect, useState } from "react";
import { getInvestor } from "../lib/api/client";
import { formatLamportsAsSol } from "../lib/estimate";
import { ShimmerList } from "./Shimmer";
import { SolAmount } from "./SolAmount";

const PRESETS = [0.1, 0.5, 1];

type ParkTab = "park" | "list";
type HoldingRow = Record<string, unknown>;

function shortAddr(pk: string) {
  if (pk.length < 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

export function ParkPage({
  title = "Park SOL",
  vaultLabel,
  vaultPubkey,
  walletPubkey,
  walletSol,
  busy,
  refreshKey = 0,
  onBack,
  onPark,
  onWithdraw,
}: {
  title?: string;
  vaultLabel?: string;
  vaultPubkey?: string | null;
  walletPubkey?: string | null;
  walletSol?: string | null;
  busy?: boolean;
  /** Bump to refetch My parks after withdraw completes. */
  refreshKey?: number;
  onBack: () => void;
  onPark: (sol: number) => void;
  onWithdraw?: (vault: string, shares: string) => void | Promise<void>;
}) {
  const [tab, setTab] = useState<ParkTab>("park");
  const [amount, setAmount] = useState("0.1");
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const balance = walletSol != null && walletSol !== "" ? parseFloat(walletSol) : null;
  const showVault =
    Boolean(vaultLabel) && vaultLabel !== "Vault" && vaultLabel!.trim().length > 0;

  const loadHoldings = useCallback(async () => {
    if (!walletPubkey) {
      setHoldings([]);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const data = await getInvestor(walletPubkey);
      setHoldings(data.holdings ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
      setHoldings([]);
    } finally {
      setListLoading(false);
    }
  }, [walletPubkey]);

  useEffect(() => {
    if (tab === "list") void loadHoldings();
  }, [tab, loadHoldings, refreshKey]);

  useEffect(() => {
    setError(null);
  }, [amount]);

  function validate(): number | null {
    const n = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter an amount greater than 0");
      return null;
    }
    if (balance != null && Number.isFinite(balance) && n > balance) {
      setError(`Insufficient balance (${balance.toFixed(3)} SOL available)`);
      return null;
    }
    if (!vaultPubkey) {
      setError("Select a vault first");
      return null;
    }
    return n;
  }

  function submit() {
    const n = validate();
    if (n == null) return;
    onPark(n);
  }

  return (
    <section className="flow-page park-page">
      <div className="flow-card">
        <header className="flow-card-head">
          <h2 className="flow-card-title">{title}</h2>
          {showVault ? <p className="flow-card-sub mono">{vaultLabel}</p> : null}
        </header>

        <div className="seg">
          <div className="seg-track">
            <button
              type="button"
              className={`seg-btn${tab === "park" ? " active" : ""}`}
              onClick={() => setTab("park")}
            >
              Park
            </button>
            <button
              type="button"
              className={`seg-btn${tab === "list" ? " active" : ""}`}
              onClick={() => setTab("list")}
            >
              My parks
            </button>
          </div>
        </div>

        {tab === "park" ? (
          <div className="flow-card-body">
            <div className="field">
              <label htmlFor="park-sol-amount">Amount (SOL)</label>
              <input
                id="park-sol-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={amount}
                disabled={busy}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>

            <div className="park-presets">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`chip park-preset${amount === String(p) ? " active" : ""}`}
                  disabled={busy}
                  onClick={() => setAmount(String(p))}
                >
                  {p}
                </button>
              ))}
              {balance != null && Number.isFinite(balance) && balance > 0 ? (
                <button
                  type="button"
                  className="chip park-preset"
                  disabled={busy}
                  onClick={() => setAmount(Math.max(0, balance - 0.005).toFixed(3))}
                >
                  Max
                </button>
              ) : null}
            </div>

            {balance != null && Number.isFinite(balance) ? (
              <p className="park-balance-hint">
                Available <SolAmount value={balance.toFixed(3)} unit="SOL" size="sm" />
              </p>
            ) : null}

            {error ? <div className="err">{error}</div> : null}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onBack} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy ? "Parking…" : "Park"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flow-card-body">
            <p className="flow-card-sub">Withdraw parked SOL back to your wallet.</p>

            {!walletPubkey ? (
              <div className="empty-hint">Unlock wallet to view parks.</div>
            ) : listLoading ? (
              <ShimmerList count={3} />
            ) : listError ? (
              <div className="err">{listError}</div>
            ) : holdings.length === 0 ? (
              <div className="empty-hint">No parks yet — park SOL from the Park tab.</div>
            ) : (
              <div className="list">
                {holdings.map((h, i) => {
                  const vault = String(h.vault ?? "");
                  const parked = String(
                    h.remaining_parked ?? h.remainingParked ?? h.shares ?? "0"
                  );
                  const shares = String(h.shares ?? "0");
                  const canWithdraw = onWithdraw && (() => {
                    try {
                      return BigInt(shares) > 0n;
                    } catch {
                      return false;
                    }
                  })();
                  return (
                    <div key={`${vault}-${i}`} className="row-card">
                      <div className="token-icon">P</div>
                      <div className="row-main">
                        <div className="row-title">Parked</div>
                        <div className="row-sub mono">{shortAddr(vault)}</div>
                      </div>
                      <div className="row-right">
                        <div className="row-value">
                          <SolAmount value={formatLamportsAsSol(parked, 3)} unit="SOL" size="md" />
                        </div>
                        {canWithdraw ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ marginTop: 6, fontSize: "var(--fs-xs)", minWidth: 0 }}
                            disabled={busy}
                            onClick={() => {
                              void (async () => {
                                try {
                                  await onWithdraw?.(vault, shares);
                                  setHoldings((prev) =>
                                    prev.filter((row) => String(row.vault ?? "") !== vault)
                                  );
                                } catch {
                                  /* parent surfaces error */
                                }
                              })();
                            }}
                          >
                            Withdraw
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={listLoading || !walletPubkey}
              onClick={() => void loadHoldings()}
            >
              Refresh
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
