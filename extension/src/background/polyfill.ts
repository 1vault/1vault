/**
 * Chrome MV3 service workers have no `window` / `document`. Solana web3.js /
 * rpc-websockets still reference window at module init — alias to globalThis.
 * Never use Vite dynamic import() here: its preload helper needs `document`.
 */
const g = globalThis as Record<string, unknown>;

if (typeof g.window === "undefined") {
  g.window = globalThis;
}
if (typeof g.global === "undefined") {
  g.global = globalThis;
}
