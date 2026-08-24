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

export type PublicPass = {
  userId: string;
  handle: string;
  name: string;
  avatar: string;
  position: number;
  joinedAt: string;
  imageUrl: string | null;
};

type PassRow = {
  user_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  joined_at: Date;
  pass_image_url: string | null;
};

/**
 * Resolves the public pass for a handle. Reads the handle from `users` rather
 * than `waitlist` so a rename on X still points at the right person, and joins
 * on the waitlist so only members get a page.
 */
export async function getPassByHandle(
  handle: string,
): Promise<PublicPass | null> {
  const row = await queryOne<PassRow>(
    `
      SELECT w.user_id::text AS user_id,
             u.handle,
             u.display_name,
             u.avatar_url,
             w.joined_at,
             w.pass_image_url
      FROM waitlist w
      JOIN users u ON u.id = w.user_id
      WHERE lower(u.handle) = lower($1)
      ORDER BY u.updated_at DESC
      LIMIT 1
    `,
    [handle],
  );
  if (!row) return null;

  const positionRow = await queryOne<{ position: string }>(
    `SELECT COUNT(*)::text AS position FROM waitlist WHERE joined_at <= $1`,
    [row.joined_at],
  );

  return {
    userId: row.user_id,
    handle: row.handle,
    name: row.display_name ?? row.handle,
    // X serves a 48px thumbnail by default; the pass needs the large variant.
    avatar: (row.avatar_url ?? "").replace("_normal.", "_400x400."),
    position: Number(positionRow?.position ?? 1),
    joinedAt: new Date(row.joined_at).toISOString(),
    imageUrl: row.pass_image_url,
  };
}

export async function savePassImageUrl(
  userId: string,
  url: string,
): Promise<void> {
  await query(
    `UPDATE waitlist SET pass_image_url = $2 WHERE user_id = $1::uuid`,
    [userId, url],
  );
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
