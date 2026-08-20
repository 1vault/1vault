import { Connection } from "@solana/web3.js";
import { config } from "./config.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Hide API keys when logging RPC URLs. */
export function redactRpcUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has("api-key")) u.searchParams.set("api-key", "***");
    return u.toString();
  } catch {
    return url.replace(/api-key=[^&\s]+/gi, "api-key=***");
  }
}

export function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code =
      "code" in cause && typeof (cause as NodeJS.ErrnoException).code === "string"
        ? (cause as NodeJS.ErrnoException).code
        : undefined;
    return code ? `${err.message} (${code}: ${cause.message})` : `${err.message} (${cause.message})`;
  }
  return err.message;
}

export function createRpcConnection(rpcUrl = config.rpcUrl): Connection {
  return new Connection(rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });
}

/** Retry transient RPC / network failures (undici "fetch failed", 429, 5xx). */
export async function withRpcRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number }
): Promise<T> {
  const attempts = opts?.attempts ?? 5;
  const baseDelayMs = opts?.baseDelayMs ?? 800;
  let lastErr: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = formatFetchError(err);
      const retryable =
        /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|429|502|503|504|Too Many Requests/i.test(
          msg
        );
      if (!retryable || i === attempts) break;
      const delay = baseDelayMs * 2 ** (i - 1);
      console.warn(`[1vault-indexer] ${label} failed (${i}/${attempts}): ${msg} — retry in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
