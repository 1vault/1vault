import { useEffect, useState } from "react";
import type { AuthUser } from "../lib/auth";
import { displayXName } from "../lib/auth";
import { fetchLicenseStatus, type LicenseStatus } from "../lib/license-balance";

type VaultType = "pooled" | "sliced";

export type CreateVaultResult = {
  vaultName: string;
  vaultType: VaultType;
  /** Performance fee on eligible profit above HWM (default 20% = 2000 bps). */
  performanceFeeBps: number;
  /** Sliced only: fee on realized profit when an investor exits early (pooled must be 0). */
  earlyExitFeeBps: number;
};

const DEFAULT_PERFORMANCE_FEE_PCT = 20;
const DEFAULT_EARLY_EXIT_FEE_PCT = 10;
const MAX_PERFORMANCE_FEE_PCT = 50;
const MAX_EARLY_EXIT_FEE_PCT = 20;

const TERMS = [
  "You understand DeFi vault trading involves risk of partial or total loss of parked SOL.",
  "Creating a vault requires locking $1VAULT licence tokens as defined by the protocol.",
  "Investors park and configure follow settings separately after the vault exists.",
  "You are responsible for your own risk management, fees, and on-chain transaction confirmations.",
  "Licence tokens locked for this vault are returned in full when the vault is closed.",
];

type Step = 1 | 2 | 3 | 4;

function pctToBps(pct: number): number {
  return Math.round(Math.max(0, pct) * 100);
}

function parsePct(raw: string): number | null {
  const n = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n;
}

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
  const [performanceFeePct, setPerformanceFeePct] = useState(String(DEFAULT_PERFORMANCE_FEE_PCT));
  const [earlyExitFeePct, setEarlyExitFeePct] = useState(String(DEFAULT_EARLY_EXIT_FEE_PCT));
  const [agreed, setAgreed] = useState(false);
  const [lockConfirmed, setLockConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  const nameOk = vaultName.trim().length >= 2 && vaultName.trim().length <= 32;

  function selectVaultType(next: VaultType) {
    setVaultType(next);
    if (next === "pooled") setEarlyExitFeePct("0");
    else if (Number(earlyExitFeePct) === 0) setEarlyExitFeePct(String(DEFAULT_EARLY_EXIT_FEE_PCT));
  }

  function validateFees(): { performanceFeeBps: number; earlyExitFeeBps: number } | null {
    const perf = parsePct(performanceFeePct);
    if (perf == null || perf < 0 || perf > MAX_PERFORMANCE_FEE_PCT) {
      setError(`Performance fee must be 0–${MAX_PERFORMANCE_FEE_PCT}% of eligible profit`);
      return null;
    }
    if (vaultType === "pooled") {
      return { performanceFeeBps: pctToBps(perf), earlyExitFeeBps: 0 };
    }
    const early = parsePct(earlyExitFeePct);
    if (early == null || early < 0 || early > MAX_EARLY_EXIT_FEE_PCT) {
      setError(`Early exit fee must be 0–${MAX_EARLY_EXIT_FEE_PCT}% of realized profit`);
      return null;
    }
    return { performanceFeeBps: pctToBps(perf), earlyExitFeeBps: pctToBps(early) };
  }

  async function loadLicense(silent = false) {
    if (!walletPubkey) {
      setLicense(null);
      setLicenseError("Unlock your wallet to check $1VAULT balance.");
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
    if (!validateFees()) return;
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
    if (!agreed || !nameOk || !license?.hasEnough || !lockConfirmed) return;
    const fees = validateFees();
    if (!fees) return;
    onCreate({
      vaultName: vaultName.trim(),
      vaultType,
      performanceFeeBps: fees.performanceFeeBps,
      earlyExitFeeBps: vaultType === "pooled" ? 0 : fees.earlyExitFeeBps,
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
                    onClick={() => selectVaultType(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <p className="muted field-hint">
              {vaultType === "pooled"
                ? "Shared book — investors ride your trades. Set a performance fee on eligible profit."
                : "Sliced book — investors can exit early. Set performance fee + early-exit fee to you."}
            </p>

            <div className="wizard-fee-block">
              <div className="wizard-fee-head">
                <h3 className="wizard-fee-title">Fee settings</h3>
                <p className="wizard-fee-sub">
                  {vaultType === "pooled"
                    ? "Investors see this before they park."
                    : "Performance + early exit. Investors see both before they park."}
                </p>
              </div>

              <div className="field">
                <label htmlFor="perf-fee">Performance fee (%)</label>
                <input
                  id="perf-fee"
                  type="number"
                  min={0}
                  max={MAX_PERFORMANCE_FEE_PCT}
                  step={1}
                  inputMode="decimal"
                  placeholder={`e.g. ${DEFAULT_PERFORMANCE_FEE_PCT}`}
                  value={performanceFeePct}
                  disabled={busy}
                  onChange={(e) => setPerformanceFeePct(e.target.value)}
                />
                <span className="field-hint muted">
                  % of eligible profit above high-water mark. Default {DEFAULT_PERFORMANCE_FEE_PCT}%,
                  max {MAX_PERFORMANCE_FEE_PCT}%.
                </span>
              </div>

              {vaultType === "sliced" ? (
                <div className="field">
                  <label htmlFor="early-exit-fee">Early exit fee (%)</label>
                  <input
                    id="early-exit-fee"
                    type="number"
                    min={0}
                    max={MAX_EARLY_EXIT_FEE_PCT}
                    step={1}
                    inputMode="decimal"
                    placeholder={`e.g. ${DEFAULT_EARLY_EXIT_FEE_PCT}`}
                    value={earlyExitFeePct}
                    disabled={busy}
                    onChange={(e) => setEarlyExitFeePct(e.target.value)}
                  />
                  <span className="field-hint muted">
                    % of realized profit when an investor exits while your book is still active.
                    Default {DEFAULT_EARLY_EXIT_FEE_PCT}%, max {MAX_EARLY_EXIT_FEE_PCT}%.
                  </span>
                </div>
              ) : (
                <p className="muted field-hint" style={{ margin: 0 }}>
                  Early exit fee is not used for Pooled (always 0 on-chain).
                </p>
              )}
            </div>

            <p className="muted" style={{ margin: 0, fontSize: "var(--fs-xs)" }}>
              Investors park SOL and set follow settings after the vault is created.
            </p>

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
                Creating <strong>{vaultName.trim()}</strong> ({vaultType}) as strategist — performance
                fee {performanceFeePct || "0"}%
                {vaultType === "sliced"
                  ? ` · early exit fee ${earlyExitFeePct || "0"}%`
                  : ""}
                . No initial park on create.
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
              <h2 className="flow-card-title">$1VAULT licence</h2>
              <p className="flow-card-sub">
                Vault creation locks <strong>$1VAULT</strong> into the vault. When the vault is closed,
                those tokens are returned in full.
              </p>
            </header>

            {licenseLoading && !license ? (
              <div className="wizard-x-card">
                <p className="muted">Checking wallet $1VAULT balance…</p>
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
                      You do not hold enough $1VAULT yet. Open Swap to buy licence tokens, then come
                      back and refresh.
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
                      You hold enough $1VAULT. Confirm locking{" "}
                      <strong>{license.lockDisplay}</strong> into this vault. On close, the full
                      amount is returned to your wallet.
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
                  Could not read $1VAULT balance. Open Swap to get licence tokens, or retry the check.
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
