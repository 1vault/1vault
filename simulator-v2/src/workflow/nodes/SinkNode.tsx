import { Handle, Position } from "@xyflow/react";
import { shortAddr, statusLabel, useWorkflow } from "../context";
import { NodeIcon } from "../icons";

export default function SinkNode({ data }: { data: { kind: "platform" | "degenFee" } }) {
  const { views } = useWorkflow();
  const view = views[data.kind];
  const title = data.kind === "platform" ? "Platform SOL" : "Degen fee SOL";
  const kicker = data.kind === "platform" ? "9Yajd…" : "EXQCB3…";

  return (
    <div className={`nv nv-sink status-${view.status}`}>
      <Handle type="target" position={Position.Left} id="in" />
      {data.kind === "degenFee" ? <Handle type="source" position={Position.Right} id="out" /> : null}
      <div className="nv-card">
      <div className="nv-stripe" />
      <div className="nv-head">
        <div className="nv-id">
          <NodeIcon name={data.kind} />
          <div>
            <div className="nv-kicker">{kicker}</div>
            <div className="nv-title">{title}</div>
          </div>
        </div>
        <span className={`pill pill-${view.status}`}>{statusLabel(view.status)}</span>
      </div>
      <div className="nv-body">
      <p className="nv-hint">{view.detail || "Paid at market exit"}</p>
      {view.fields ? (
        <div className="nv-data">
          <div className="nv-row">
            <span>wallet</span>
            <span className="mono">{shortAddr(view.fields.wallet)}</span>
          </div>
          <div className="nv-row">
            <span>before</span>
            <span className="mono">{view.fields.before}</span>
          </div>
          <div className="nv-row">
            <span>after</span>
            <span className="mono">{view.fields.after}</span>
          </div>
          <div className="nv-delta">
            {Number(view.fields.delta) >= 0 ? "+" : ""}
            {view.fields.delta} SOL
          </div>
        </div>
      ) : null}
      {view.fields?.explorer ? (
        <a className="nv-link" href={view.fields.explorer} target="_blank" rel="noreferrer">
          explorer
        </a>
      ) : null}
      </div>
      </div>
    </div>
  );
}
