// Dev helper: mint a pass token and save the rendered PNG for visual review.
import { writeFile } from "node:fs/promises";
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

const token = await new SignJWT({
  handle: "1vaults",
  name: "1Vault",
  avatar: "https://avatars.githubusercontent.com/u/14985020?s=400",
  position: 42,
  joinedAt: new Date().toISOString(),
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("30m")
  .sign(secret);

const res = await fetch(`http://localhost:3000/api/pass?t=${token}`);
console.log("status", res.status, res.headers.get("content-type"));

if (!res.ok) {
  console.log(await res.text());
  process.exit(1);
}

await writeFile("pass-preview.png", Buffer.from(await res.arrayBuffer()));
console.log("saved pass-preview.png");

const page = await fetch(`http://localhost:3000/pass/${token}`);
const html = await page.text();
console.log("share page", page.status);
console.log(
  html
    .split("\n")
    .filter((line) => line.includes("twitter:") || line.includes("og:image"))
    .join("\n") || "(no card tags found)",
);
