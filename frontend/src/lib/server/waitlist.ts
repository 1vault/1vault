import { query, queryOne } from "./db";
import type { TwitterUser } from "./twitter";

export type DbUser = {
  id: string;
  twitter_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
};

export async function upsertTwitterUser(me: TwitterUser): Promise<DbUser> {
  const row = await queryOne<DbUser>(
    `
      INSERT INTO users (twitter_id, handle, display_name, avatar_url, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (twitter_id) DO UPDATE SET
        handle = EXCLUDED.handle,
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW()
      RETURNING id::text, twitter_id, handle, display_name, avatar_url
    `,
    [me.id, me.username, me.name, me.profile_image_url ?? null],
  );
  if (!row) throw new Error("Failed to upsert user");
  return row;
}

export async function getUserById(userId: string): Promise<DbUser | null> {
  return queryOne<DbUser>(
    `
      SELECT id::text, twitter_id, handle, display_name, avatar_url
      FROM users WHERE id = $1::uuid
    `,
    [userId],
  );
}

export type WaitlistRow = {
  handle: string;
  joined_at: Date;
};

export type JoinWaitlistResult = {
  status: "joined" | "existing";
  handle: string;
  position: number;
  joinedAt: string;
};

export async function joinWaitlist(user: DbUser): Promise<JoinWaitlistResult> {
  const inserted = await query<{ joined_at: Date }>(
    `
      INSERT INTO waitlist (user_id, twitter_id, handle)
      VALUES ($1::uuid, $2, $3)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING joined_at
    `,
    [user.id, user.twitter_id, user.handle],
  );

  const status: "joined" | "existing" =
    inserted.length > 0 ? "joined" : "existing";

  const row = await queryOne<WaitlistRow>(
    `SELECT handle, joined_at FROM waitlist WHERE user_id = $1::uuid`,
    [user.id],
  );
  if (!row) throw new Error("Waitlist row missing after insert");

  const positionRow = await queryOne<{ position: string }>(
    `SELECT COUNT(*)::text AS position FROM waitlist WHERE joined_at <= $1`,
    [row.joined_at],
  );

  return {
    status,
    handle: row.handle,
    position: Number(positionRow?.position ?? 1),
    joinedAt: new Date(row.joined_at).toISOString(),
  };
}

export async function getWaitlistForUser(
  userId: string,
): Promise<JoinWaitlistResult | null> {
  const row = await queryOne<WaitlistRow>(
    `SELECT handle, joined_at FROM waitlist WHERE user_id = $1::uuid`,
    [userId],
  );
  if (!row) return null;

  const positionRow = await queryOne<{ position: string }>(
    `SELECT COUNT(*)::text AS position FROM waitlist WHERE joined_at <= $1`,
    [row.joined_at],
  );

  return {
    status: "existing",
    handle: row.handle,
    position: Number(positionRow?.position ?? 1),
    joinedAt: new Date(row.joined_at).toISOString(),
  };
}
