import { Connection } from "@solana/web3.js";

export function isRetryable(msg: string): boolean {
  return /429|403|fetch failed|timed out|timeout|EAI_AGAIN|503/i.test(msg);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class RpcPool {
  conn: Connection;
  constructor(url: string) {
    this.conn = new Connection(url, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60_000,
    });
  }
  async retry<T>(fn: (c: Connection) => Promise<T>, attempts = 10): Promise<T> {
    let delay = 2000;
    for (let n = 0; n < attempts; n++) {
      try {
        return await fn(this.conn);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (n === attempts - 1 || !isRetryable(msg)) throw err;
        await sleep(delay);
        delay = Math.min(delay * 2, 20000);
      }
    }
    throw new Error("rpc exhausted");
  }
}
