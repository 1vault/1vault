// Dev helper: pick a real waitlist handle, then check the public pass page's
// card tags and save the rendered PNG for visual review.
// Run with: node --env-file=.env.local scripts/pass-preview.mjs
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";

const ORIGIN = process.env.SITE_URL ?? "http://localhost:3000";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: process.env.DATABASE_URL?.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined,
});

const { rows } = await pool.query(`
  SELECT u.handle, w.pass_image_url
  FROM waitlist w JOIN users u ON u.id = w.user_id
  ORDER BY w.joined_at DESC LIMIT 5
`);
await pool.end();

if (rows.length === 0) {
  console.log("No waitlist rows yet — sign in with X first.");
  process.exit(1);
}

console.log("waitlist handles:", rows.map((r) => r.handle).join(", "));

const handle = rows[0].handle;
console.log(`\nstored blob url: ${rows[0].pass_image_url ?? "(none)"}`);

const img = await fetch(`${ORIGIN}/api/pass?h=${handle}`);
console.log("image", img.status, img.headers.get("content-type"));
if (!img.ok) {
  console.log(await img.text());
  process.exit(1);
}
await writeFile("pass-preview.png", Buffer.from(await img.arrayBuffer()));
console.log("saved pass-preview.png");

const page = await fetch(`${ORIGIN}/${handle}`);
const html = await page.text();
console.log(`\nGET /${handle} → ${page.status}`);
console.log(
  (html.match(/<meta[^>]+(twitter:|og:image)[^>]*>/g) ?? ["(no card tags)"])
    .join("\n"),
);

const missing = await fetch(`${ORIGIN}/definitely-not-a-handle-xx`);
console.log(`\nunknown handle → ${missing.status} (expected 404)`);
