/** Sleep helper — paces RPC / API calls during Release. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const RATE_LIMIT_RE = /429|Too many requests|rate.?limit|503|blocked/i;

export function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RATE_LIMIT_RE.test(msg);
}

/** Retry on Solana/public RPC rate limits with exponential backoff. */
export async function withRpcRetry<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseMs?: number; label?: string }
): Promise<T> {
  const attempts = opts?.attempts ?? 5;
  const baseMs = opts?.baseMs ?? 900;
  let delay = baseMs;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRateLimitError(e) || i === attempts - 1) throw e;
      await sleep(delay + Math.floor(Math.random() * 200));
      delay = Math.min(Math.floor(delay * 1.8), 10_000);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
