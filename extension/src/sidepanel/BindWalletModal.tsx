import { useState } from "react";
import { bindWalletWithKeypair } from "../lib/auth/bind";
import type { AuthSession } from "../lib/auth";
import { sendBg } from "../lib/messaging";

export function BindWalletModal({
  session,
  pubkey,
  onClose,
  onBound,
}: {
  session: AuthSession;
  pubkey: string;
  onClose: () => void;
  onBound: (session: AuthSession) => void;
}) {
  const [role, setRole] = useState<"strategies" | "investors">("strategies");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyBound = session.user?.wallets?.some((w) => w.pubkey === pubkey);

  async function onBind() {
    setBusy(true);
    setError(null);
    try {
      const updated = await bindWalletWithKeypair(session, pubkey, async (message) => {
        const res = await sendBg<{ signature: string }>({ type: "SIGN_BIND_MESSAGE", message });
        return res.signature;
      }, role, true);
      onBound(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card modal-sheet">
        <header className="modal-sheet-head">
          <h2 className="modal-sheet-title">Verify wallet</h2>
          <p className="modal-sheet-sub">
            Link your Solana wallet to your X account for verified vault badges on the leaderboard.
          </p>
        </header>
        <p className="mono" style={{ fontSize: "var(--fs-xs)", margin: 0 }}>
          {pubkey.slice(0, 6)}…{pubkey.slice(-4)}
        </p>
        {alreadyBound ? (
          <div className="ok">This wallet is already verified.</div>
        ) : (
          <>
            <div className="seg">
              <div className="seg-track">
                {(
                  [
                    ["strategies", "Strategist"],
                    ["investors", "Investor"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`seg-btn${role === id ? " active" : ""}`}
                    onClick={() => setRole(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {error && <div className="err">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void onBind()} disabled={busy}>
                {busy ? "Signing…" : "Sign & verify"}
              </button>
            </div>
          </>
        )}
        {alreadyBound ? (
          <button type="button" className="btn btn-secondary btn-block" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}
