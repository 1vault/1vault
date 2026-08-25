import type { FlowMode } from "../lib/flow";

const PROCESSING_LABEL: Record<string, string> = {
  "create-vault": "Creating vault…",
  deposit: "Parking SOL…",
  "open-position": "Opening position…",
  "exit-position": "Closing position…",
  "claim-fees": "Claiming fees…",
  "close-vault": "Closing vault…",
  withdraw: "Withdrawing…",
};

export function processingLabel(mode?: FlowMode): string {
  if (!mode) return "Processing…";
  return PROCESSING_LABEL[mode] ?? "Processing…";
}

export function completedLabel(mode?: FlowMode): string {
  const map: Record<string, string> = {
    "create-vault": "Vault created",
    deposit: "SOL parked",
    "open-position": "Position opened",
    "exit-position": "Position closed",
    "claim-fees": "Fees claimed",
    "close-vault": "Vault closed",
    withdraw: "Withdrawn",
  };
  if (!mode) return "Done";
  return map[mode] ?? mode.replace(/-/g, " ");
}

type ProcessingBannerProps = {
  mode?: FlowMode;
  onCancel?: () => void;
};

export function ProcessingBanner({ mode, onCancel }: ProcessingBannerProps) {
  return (
    <div className="processing-banner" role="status" aria-live="polite">
      <span className="processing-banner-dot" aria-hidden />
      <span className="processing-banner-text">{processingLabel(mode)}</span>
      {onCancel ? (
        <button type="button" className="processing-banner-cancel" onClick={onCancel}>
          Cancel
        </button>
      ) : null}
    </div>
  );
}
