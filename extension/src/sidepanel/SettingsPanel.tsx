import { CLUSTER } from "../lib/config";
import type { AuthSession } from "../lib/auth";
import { formatXHandle } from "../lib/auth";

export function SettingsPanel({
  session,
  walletPubkey,
  walletSol,
  backendOk,
  onVerifyWallet,
  onLock,
  onLogout,
}: {
  session: AuthSession | null;
  walletPubkey: string | null;
  walletSol: string | null;
  backendOk?: boolean | null;
  onVerifyWallet: () => void;
  onLock: () => void;
  onLogout: () => void;
}) {
  const apiStatus =
    backendOk === true ? "Online" : backendOk === false ? "Offline" : "Checking…";

  return (
    <section className="settings hero">
      <h1 className="hero-title">Settings</h1>

      <div className="list">
        <div className="row-card">
          <div className="token-icon">X</div>
          <div className="row-main">
            <div className="row-title">{session ? formatXHandle(session.user) : "Not signed in"}</div>
            <div className="row-sub">Connected account</div>
          </div>
        </div>
        {walletPubkey ? (
          <div className="row-card">
            <div className="token-icon">◎</div>
            <div className="row-main">
              <div className="row-title mono">{walletPubkey.slice(0, 8)}…{walletPubkey.slice(-4)}</div>
              <div className="row-sub">
                Wallet · {walletSol != null ? `${walletSol} SOL available` : "balance —"}
              </div>
            </div>
          </div>
        ) : null}
        <div className="row-card">
          <div className="token-icon">N</div>
          <div className="row-main">
            <div className="row-title">{CLUSTER}</div>
            <div className="row-sub">Cluster</div>
          </div>
        </div>
        <div className="row-card">
          <div className="token-icon">API</div>
          <div className="row-main">
            <div className="row-title">{apiStatus}</div>
            <div className="row-sub">Backend</div>
          </div>
        </div>
      </div>

      <div className="hero-actions">
        {session && walletPubkey ? (
          <button type="button" className="btn btn-primary" onClick={onVerifyWallet}>
            Verify wallet
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={onLock}>
          Lock wallet
        </button>
        {session ? (
          <button type="button" className="btn btn-secondary danger" onClick={onLogout}>
            Logout X
          </button>
        ) : null}
      </div>
    </section>
  );
}
