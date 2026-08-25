import { useEffect, useState } from "react";
import type { AuthUser } from "../lib/auth";
import { displayXName } from "../lib/auth";
import { fetchLicenseStatus, type LicenseStatus } from "../lib/license-balance";

type VaultType = "pooled" | "sliced";

export type CreateVaultResult = {
  vaultName: string;
  vaultType: VaultType;
  parkSol: number;
};

const TERMS = [
  "You understand DeFi vault trading involves risk of partial or total loss of parked SOL.",
  "Creating a vault requires locking 1VL licence tokens as defined by the protocol.",
  "Investors who park into your vault may copy your trades; close payouts settle by share weight.",
  "You are responsible for your own risk management, fees, and on-chain transaction confirmations.",
  "Licence tokens locked for this vault are returned in full when the vault is closed.",
];

type Step = 1 | 2 | 3 | 4;

export function CreateVaultWizard({
  authUser,
  walletPubkey,
  walletBound,
  busy,
  onClose,
  onConnectX,
  onVerifyWallet,
  onCreate,
}: {
  authUser?: AuthUser | null;
  walletPubkey?: string | null;
  walletBound?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConnectX?: () => void;
  onVerifyWallet?: () => void;
  onCreate: (result: CreateVaultResult) => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [vaultName, setVaultName] = useState("");
  const [vaultType, setVaultType] = useState<VaultType>("pooled");
  const [parkSol, setParkSol] = useState("0.1");
  const [agreed, setAgreed] = useState(false);
  const [lockConfirmed, setLockConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  const nameOk = vaultName.trim().length >= 2 && vaultName.trim().length <= 32;
  const parkN = parseFloat(parkSol);
  const parkOk = Number.isFinite(parkN) && parkN > 0;

  async function loadLicense(silent = false) {
    if (!walletPubkey) {
      setLicense(null);
      setLicenseError("Unlock your wallet to check 1VL balance.");
      return;
    }
    if (!silent) setLicenseLoading(true);
    setLicenseError(null);
    try {
      const status = await fetchLicenseStatus(walletPubkey);
      setLicense(status);
      if (!status.hasEnough) setLockConfirmed(false);
    } catch (e) {
      setLicense(null);
      setLicenseError(e instanceof Error ? e.message : "Could not load licence balance");
    } finally {
      setLicenseLoading(false);
    }
  }

  useEffect(() => {
    if (step !== 4) return;
    void loadLicense();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when entering step 4 / wallet changes
  }, [step, walletPubkey]);

  function nextFromStep1() {
    setError(null);
    if (!nameOk) {
      setError("Vault name must be 2–32 characters");
      return;
    }
    if (!parkOk) {
      setError("Initial park must be greater than 0 SOL");
      return;
    }
    setStep(2);
  }

  function nextFromTerms() {
    setError(null);
    if (!agreed) {
      setError("Agree to the terms to continue.");
      return;
    }
    setStep(4);
  }

  function openSwap() {
    const url =
      license?.swapUrl ??
      "https://jup.ag/swap/SOL-4R9AHfF2wE8X8252Swra3ncvKVDe3m73k8EfP99zz6YK";
    void chrome.tabs.create({ url });
  }

  function submit() {
    if (!agreed || !nameOk || !parkOk || !license?.hasEnough || !lockConfirmed) return;
    onCreate({
      vaultName: vaultName.trim(),
      vaultType,
      parkSol: parkN,
    });
  }

  const handle = authUser ? displayXName(authUser) : null;
  const xConnected = Boolean(authUser);
  const verified = Boolean(walletBound);
  const canCreate = Boolean(license?.hasEnough && lockConfirmed && agreed);

  return (
    <section className="flow-page create-wizard">
      <div className="flow-card">
        <div className="wizard-steps">
          <span className={step === 1 ? "active" : step > 1 ? "done" : ""}>1</span>
          <span className={step === 2 ? "active" : step > 2 ? "done" : ""}>2</span>
          <span className={step === 3 ? "active" : step > 3 ? "done" : ""}>3</span>
          <span className={step === 4 ? "active" : ""}>4</span>
        </div>

        {step === 1 && (
          <div className="flow-card-body">
            <header className="flow-card-head">
              <h2 className="flow-card-title">Name your vault</h2>
              <p className="flow-card-sub">This name shows on Discover and your vault profile.</p>
            </header>

            <div className="field">
              <label htmlFor="vault-name">Vault name</label>
              <input
                id="vault-name"
                type="text"
                maxLength={32}
                placeholder="e.g. Night Runner"
                value={vaultName}
                disabled={busy}
                onChange={(e) => setVaultName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="seg">
              <div className="seg-track">
                {(
                  [
                    ["pooled", "Pooled"],
                    ["sliced", "Sliced"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`seg-btn${vaultType === id ? " active" : ""}`}
                    disabled={busy}
                    onClick={() => setVaultType(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="create-park-sol">Initial park (SOL)</label>
              <input
                id="create-park-sol"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={parkSol}
                disabled={busy}
                onChange={(e) => setParkSol(e.target.value)}
              />
            </div>

            {error ? <div className="err">{error}</div> : null}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={nextFromStep1} disabled={busy}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flow-card-body">
            <header className="flow-card-head">
              <h2 className="flow-card-title">X connection</h2>
              <p className="flow-card-sub">
                Linking X lets investors trust your vault on the leaderboard. Optional — you can create
                without it.
              </p>
            </header>

            {xConnected && verified ? (
              <div className="ok">
                Vault will show as verified{handle ? ` · ${handle}` : ""}.
              </div>
            ) : xConnected && !verified ? (
              <div className="wizard-x-card">
                <p className="muted">
                  X connected{handle ? ` as ${handle}` : ""}, but this wallet is not verified yet.
                </p>
                {onVerifyWallet ? (
                  <button type="button" className="btn btn-secondary btn-block" onClick={onVerifyWallet}>
                    Verify wallet
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="wizard-x-card">
                <p className="muted">Connect X to earn a verified badge on Discover.</p>
                {onConnectX ? (
                  <button type="button" className="btn btn-secondary btn-block" onClick={onConnectX}>
                    Connect X
                  </button>
                ) : null}
              </div>
            )}

            {walletPubkey ? (
              <p className="mono muted" style={{ fontSize: "var(--fs-xs)", margin: 0 }}>
                {walletPubkey.slice(0, 6)}…{walletPubkey.slice(-4)}
              </p>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} disabled={busy}>
                Previous
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)} disabled={busy}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flow-card-body">
            <header className="flow-card-head">
              <h2 className="flow-card-title">Terms</h2>
              <p className="flow-card-sub">
                Creating <strong>{vaultName.trim()}</strong> ({vaultType}) with {parkSol} SOL initial
                park.
              </p>
            </header>

            <ul className="wizard-terms">
              {TERMS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>

            <label className="wizard-check">
              <input
                type="checkbox"
                checked={agreed}
                disabled={busy}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>I agree to the terms and conditions</span>
            </label>

            {error ? <div className="err">{error}</div> : null}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(2)} disabled={busy}>
                Previous
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={nextFromTerms}
                disabled={busy || !agreed}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flow-card-body">
            <header className="flow-card-head">
              <h2 className="flow-card-title">1VL licence</h2>
              <p className="flow-card-sub">
                Vault creation locks 1VL into the vault. When the vault is closed, those tokens are
                returned in full.
              </p>
            </header>

            {licenseLoading && !license ? (
              <div className="wizard-x-card">
                <p className="muted">Checking wallet 1VL balance…</p>
              </div>
            ) : null}

            {licenseError ? <div className="err">{licenseError}</div> : null}

            {license ? (
              <>
                <div className="wizard-license-stats">
                  <div>
                    <span className="muted">Required lock</span>
                    <strong>{license.lockDisplay}</strong>
                  </div>
                  <div>
                    <span className="muted">Your balance</span>
                    <strong className={license.hasEnough ? "ok-text" : "warn-text"}>
                      {license.balanceDisplay}
                    </strong>
                  </div>
                </div>

                {!license.hasEnough ? (
                  <div className="wizard-x-card wizard-license-need">
                    <p className="muted" style={{ margin: "0 0 10px" }}>
                      You do not hold enough 1VL yet. Open Swap to buy licence tokens, then come back
                      and refresh.
                    </p>
                    <div className="wizard-license-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        disabled={busy}
                        onClick={openSwap}
                      >
                        Go to Swap
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-block"
                        disabled={busy || licenseLoading}
                        onClick={() => void loadLicense()}
                      >
                        {licenseLoading ? "Refreshing…" : "Refresh balance"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="wizard-x-card">
                    <p className="muted" style={{ margin: "0 0 10px" }}>
                      You hold enough 1VL. Confirm locking <strong>{license.lockDisplay}</strong> into
                      this vault. On close, the full amount is returned to your wallet.
                    </p>
                    <label className="wizard-check">
                      <input
                        type="checkbox"
                        checked={lockConfirmed}
                        disabled={busy}
                        onChange={(e) => setLockConfirmed(e.target.checked)}
                      />
                      <span>
                        I confirm locking {license.lockDisplay}. Tokens return in full when the vault
                        is closed.
                      </span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-block"
                      disabled={busy || licenseLoading}
                      onClick={() => void loadLicense()}
                    >
                      {licenseLoading ? "Refreshing…" : "Refresh balance"}
                    </button>
                  </div>
                )}
              </>
            ) : !licenseLoading ? (
              <div className="wizard-x-card wizard-license-need">
                <p className="muted" style={{ margin: "0 0 10px" }}>
                  Could not read 1VL balance. Open Swap to get licence tokens, or retry the check.
                </p>
                <div className="wizard-license-actions">
                  <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={openSwap}>
                    Go to Swap
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    disabled={busy || licenseLoading}
                    onClick={() => void loadLicense()}
                  >
                    Retry check
                  </button>
                </div>
              </div>
            ) : null}

            {error ? <div className="err">{error}</div> : null}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(3)} disabled={busy}>
                Previous
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submit}
                disabled={busy || licenseLoading || !canCreate}
              >
                {busy ? "Creating…" : "Create vault"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
