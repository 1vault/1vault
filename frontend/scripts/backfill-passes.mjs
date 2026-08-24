// Uploads a pass image for every waitlist member that does not have one yet,
// so no crawler is ever the first to trigger a render.
//
// Requires a Blob store to be connected in Vercel. Run against production:
//   node --env-file=.env.local scripts/backfill-passes.mjs
//   TARGET=https://www.1vaults.xyz node --env-file=.env.local scripts/backfill-passes.mjs
import { Pool } from "pg";

const target = (process.env.TARGET ?? "https://www.1vaults.xyz").replace(
  /\/$/,
  "",
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: process.env.DATABASE_URL?.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined,
});

async function members() {
  const { rows } = await pool.query(`
    SELECT u.handle, w.pass_image_url
    FROM waitlist w JOIN users u ON u.id = w.user_id
    ORDER BY w.joined_at
  `);
  return rows;
}

const before = await members();
const pending = before.filter((row) => !row.pass_image_url);

console.log(`${before.length} members, ${pending.length} without an image`);

for (const { handle } of pending) {
  // Requesting the public page runs the upload inside generateMetadata.
  const started = Date.now();
  const res = await fetch(`${target}/${handle}`);
  console.log(`  ${handle}: ${res.status} in ${Date.now() - started}ms`);
}

const after = await members();
await pool.end();

console.log("\nstored:");
for (const row of after) {
  const state = row.pass_image_url ?? "STILL MISSING";
  console.log(`  ${row.handle}: ${state}`);
}

const missing = after.filter((row) => !row.pass_image_url);
if (missing.length > 0) {
  console.log(
    `\n${missing.length} still missing — check that BLOB_READ_WRITE_TOKEN is set` +
      " on the deployment and look for 'Failed to store pass image' in the logs.",
  );
  process.exit(1);
}

console.log("\nAll passes stored.");
