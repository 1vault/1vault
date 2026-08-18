import type { Node, Edge } from "@xyflow/react";
import type { NodeStatus, RetailSettings, WorkflowNodeId } from "../../shared/events";

export type { RetailSettings };

export type WalletSlot = {
  secret: string;
  useCli: boolean;
  pubkey?: string;
  sol?: string;
  error?: string;
};

export const defaultRetailSettings: RetailSettings = {
  autoFollow: true,
  copyBps: 5000,
  maxPositionBps: 5000,
  followTpSl: true,
  parkSol: 0.1,
};

export type NodeView = {
  status: NodeStatus;
  detail?: string;
  tx?: string;
  fields?: Record<string, string>;
};

export const initialViews: Record<WorkflowNodeId, NodeView> = {
  degen: { status: "idle" },
  retail: { status: "idle" },
  protocol: { status: "idle" },
  license: { status: "idle" },
  vault: { status: "idle" },
  settings: { status: "idle" },
  deposit: { status: "idle" },
  ata: { status: "idle" },
  request: { status: "idle" },
  execute: { status: "idle" },
  openPos: { status: "idle" },
  mirror: { status: "idle" },
  mark: { status: "idle" },
  closePos: { status: "idle" },
  accrue: { status: "idle" },
  claim: { status: "idle" },
  withdraw: { status: "idle" },
  platform: { status: "idle" },
  degenFee: { status: "idle" },
};

const C = 232;
const R = 322;
export const LAYOUT_REV = 6;
const x = (col: number) => 32 + col * C;
const y = (row: number) => 28 + row * R;

export function buildNodes(): Node[] {
  return [
    { id: "degen", type: "wallet", position: { x: x(0), y: y(0) }, data: { role: "degen" } },
    { id: "license", type: "process", position: { x: x(1), y: y(0) }, data: { kind: "license" } },
    { id: "vault", type: "process", position: { x: x(2), y: y(0) }, data: { kind: "vault", ports: ["in", "out", "bottom"] } },
    { id: "ata", type: "process", position: { x: x(3), y: y(0) }, data: { kind: "ata" } },
    { id: "request", type: "process", position: { x: x(4), y: y(0) }, data: { kind: "request" } },
    { id: "execute", type: "process", position: { x: x(5), y: y(0) }, data: { kind: "execute" } },
    { id: "openPos", type: "process", position: { x: x(6), y: y(0) }, data: { kind: "openPos", ports: ["in"] } },

    { id: "retail", type: "wallet", position: { x: x(0), y: y(1) }, data: { role: "retail" } },
    { id: "settings", type: "settings", position: { x: x(1), y: y(1) }, data: {} },
    { id: "deposit", type: "process", position: { x: x(2), y: y(1) }, data: { kind: "deposit", ports: ["in", "out", "top"] } },
    { id: "mirror", type: "process", position: { x: x(3), y: y(1) }, data: { kind: "mirror" } },
    { id: "mark", type: "process", position: { x: x(4), y: y(1) }, data: { kind: "mark" } },
    { id: "closePos", type: "process", position: { x: x(5), y: y(1) }, data: { kind: "closePos" } },
    { id: "withdraw", type: "process", position: { x: x(6), y: y(1) }, data: { kind: "withdraw", ports: ["in", "bottom"] } },

    { id: "protocol", type: "protocol", position: { x: x(0), y: y(2) }, data: {} },
    { id: "accrue", type: "process", position: { x: x(3), y: y(2) }, data: { kind: "accrue", ports: ["top", "out"] } },
    { id: "claim", type: "process", position: { x: x(4), y: y(2) }, data: { kind: "claim" } },
    { id: "degenFee", type: "sink", position: { x: x(5), y: y(2) }, data: { kind: "degenFee" } },
    { id: "platform", type: "sink", position: { x: x(6), y: y(2) }, data: { kind: "platform" } },
  ];
}

const EDGE = {
  type: "smoothstep" as const,
  pathOptions: { borderRadius: 18, offset: 28 },
  style: { stroke: "#1d6a93", strokeWidth: 1.8 },
};

export function buildEdges(views: Record<WorkflowNodeId, NodeView>): Edge[] {
  const defs: Array<[string, string, string, string, string]> = [
    ["degen", "license", "e-degen-license", "out", "in"],
    ["license", "vault", "e-license-vault", "out", "in"],
    ["vault", "ata", "e-vault-ata", "out", "in"],
    ["ata", "request", "e-ata-request", "out", "in"],
    ["request", "execute", "e-request-execute", "out", "in"],
    ["execute", "openPos", "e-execute-enter", "out", "in"],

    ["retail", "settings", "e-retail-settings", "out", "in"],
    ["settings", "deposit", "e-settings-vault", "out", "in"],
    ["deposit", "mirror", "e-vault-follow", "out", "in"],
    ["mirror", "mark", "e-follow-pnl", "out", "in"],
    ["mark", "closePos", "e-pnl-realize", "out", "in"],
    ["closePos", "withdraw", "e-realize-exit", "out", "in"],

    ["vault", "deposit", "e-create-join", "bottom", "top"],
    ["withdraw", "accrue", "e-exit-accrue", "bottom", "top"],

    ["accrue", "claim", "e-accrue-pay", "out", "in"],
    ["claim", "degenFee", "e-pay-degen", "out", "in"],
    ["degenFee", "platform", "e-degen-platform", "out", "in"],
  ];

  return defs.map(([source, target, id, sourceHandle, targetHandle]) => {
    const srcStatus = views[source as WorkflowNodeId]?.status ?? "idle";
    const tgtStatus = views[target as WorkflowNodeId]?.status ?? "idle";
    const active = srcStatus === "running" || tgtStatus === "running";
    const done =
      (srcStatus === "success" || srcStatus === "skipped") &&
      (tgtStatus === "success" || tgtStatus === "skipped" || tgtStatus === "running");
    return {
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
      ...EDGE,
      animated: false,
      className: done ? "edge-done" : active ? "edge-live" : "edge-idle",
      style: {
        stroke: active ? "#5ec8f2" : done ? "#2f9d6a" : "#1d6a93",
        strokeWidth: active ? 2.4 : 1.8,
      },
    };
  });
}
