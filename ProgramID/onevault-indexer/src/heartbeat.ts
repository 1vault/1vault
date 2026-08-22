import { pool } from "./db.js";

const DEFAULT_MAX_AGE_MS = Number(process.env.POLL_STALE_MS ?? 30_000);

export async function touchHeartbeat(role: "poller" | "api"): Promise<void> {
  await pool.query(
    `INSERT INTO indexer_heartbeat (role, last_seen_at) VALUES ($1, NOW())
     ON CONFLICT (role) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
    [role]
  );
}

export async function componentStatus(
  role: "poller" | "api",
  maxAgeMs = DEFAULT_MAX_AGE_MS
): Promise<{ ok: boolean; lastSeenAt: string | null; ageMs: number | null }> {
  const { rows } = await pool.query<{ last_seen_at: Date }>(
    `SELECT last_seen_at FROM indexer_heartbeat WHERE role = $1`,
    [role]
  );
  if (!rows[0]) {
    return { ok: false, lastSeenAt: null, ageMs: null };
  }
  const last = rows[0].last_seen_at;
  const ageMs = Date.now() - last.getTime();
  return {
    ok: ageMs <= maxAgeMs,
    lastSeenAt: last.toISOString(),
    ageMs,
  };
}
