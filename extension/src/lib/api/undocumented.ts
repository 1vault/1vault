/**
 * Hand-written wrappers for routes that exist on the Go router but are missing
 * from backend/docs/openapi.yaml. Delete this file once the spec is synced.
 *
 * - POST /v1/flows/{id}/refresh  — required before every sign (stale blockhash)
 * - POST /v1/flows/{id}/retry    — open_position after execute_trade confirm lag
 * - POST /v1/tx/update-vault-risk — allowlist mint before open-position
 */
import { api } from "./client";

export type FlowJob = {
  id: string;
  status: string;
  mode?: string;
  currentStep?: number;
  context?: Record<string, unknown>;
  error?: string;
  steps?: Array<{
    seq: number;
    name: string;
    status: string;
    prepared?: {
      transaction?: string;
      recentBlockhash?: string;
      feePayer?: string;
      requiredSigners?: string[];
      signerDetails?: Array<{ pubkey: string; userMustSign?: boolean; signerKind?: string }>;
    };
    signature?: string;
    requiredSigners?: string[];
    signerDetails?: Array<{ pubkey: string; userMustSign?: boolean }>;
  }>;
};

export async function refreshFlow(id: string): Promise<FlowJob> {
  return api<FlowJob>(`/v1/flows/${encodeURIComponent(id)}/refresh`, { method: "POST" });
}

export async function retryFlow(id: string): Promise<FlowJob> {
  return api<FlowJob>(`/v1/flows/${encodeURIComponent(id)}/retry`, { method: "POST" });
}

export async function updateVaultRisk(body: Record<string, unknown>): Promise<{
  transaction?: string;
  [k: string]: unknown;
}> {
  return api("/v1/tx/update-vault-risk", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function startFlow(body: Record<string, unknown>): Promise<FlowJob> {
  return api<FlowJob>("/v1/flows", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getFlow(id: string): Promise<FlowJob> {
  return api<FlowJob>(`/v1/flows/${encodeURIComponent(id)}`);
}

export async function submitFlowStep(id: string, signedTransaction: string): Promise<FlowJob> {
  return api<FlowJob>(`/v1/flows/${encodeURIComponent(id)}/submit`, {
    method: "POST",
    body: JSON.stringify({ signedTransaction }),
  });
}

export async function cancelFlow(id: string): Promise<FlowJob> {
  return api<FlowJob>(`/v1/flows/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}
