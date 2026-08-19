import { shortAddr, statusLabel, useWorkflow } from "../context";
import { NodeIcon } from "../icons";

export default function ProtocolNode() {
  const { protocol, views } = useWorkflow();
  const view = views.protocol;

  return (
    <div className={`nv nv-protocol status-${view.status === "idle" && protocol ? "ready" : view.status}`}>
      <div className="nv-card">
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
      <div className="nv-body">
      <div className="nv-data">
        <Row label="program" value={shortAddr(protocol?.programId)} href={protocol?.explorerProgram} />
        <Row
          label="licence"
          value={protocol?.licenseName ?? "1vault Licence"}
        />
        <Row
          label="lock"
          value={protocol?.licenseLockTokens ? `${Number(protocol.licenseLockTokens).toLocaleString("en-US")}` : "1,000,000"}
        />
        <Row
          label="mint"
          value={shortAddr(protocol?.licenseMint)}
          href={
            protocol?.licenseMint
              ? `https://explorer.solana.com/address/${protocol.licenseMint}?cluster=devnet`
              : undefined
          }
        />
      </div>
      </div>
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
