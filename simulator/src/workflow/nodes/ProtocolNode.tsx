import { shortAddr, statusLabel, useWorkflow } from "../context";
import { NodeIcon } from "../icons";

export default function ProtocolNode() {
  const { protocol, views } = useWorkflow();
  const view = views.protocol;
  const fields = view.fields;

  return (
    <div className={`nv nv-protocol status-${view.status === "idle" && protocol ? "ready" : view.status}`}>
      <div className="nv-stripe" />
      <div className="nv-head">
        <div className="nv-id">
          <NodeIcon name="protocol" />
          <div>
            <div className="nv-kicker">devnet</div>
            <div className="nv-title">1Vault protocol</div>
          </div>
        </div>
        <span className={`pill pill-${view.status === "idle" ? "ready" : view.status}`}>
          {statusLabel(view.status === "idle" ? "ready" : view.status)}
        </span>
      </div>
      <div className="nv-data">
        <Row label="program" value={shortAddr(protocol?.programId)} href={protocol?.explorerProgram} />
        <Row
          label="platform"
          value={shortAddr(fields?.platform ?? protocol?.platformWallet)}
        />
        <Row
          label="degen fee"
          value={shortAddr(fields?.degenFee ?? protocol?.degenFeeWallet)}
        />
        {fields?.platformSol ? <Row label="platform SOL" value={fields.platformSol} /> : null}
        {fields?.degenFeeSol ? <Row label="degen SOL" value={fields.degenFeeSol} /> : null}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const inner = <span className="mono">{value}</span>;
  return (
    <div className="nv-row">
      <span>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}
