/**
 * Chrome MV3 service workers have no `window`. Solana web3.js / rpc-websockets
 * still reference it at module init — alias to globalThis before those imports load.
 */
const g = globalThis as Record<string, unknown>;

if (typeof g.window === "undefined") {
  g.window = globalThis;
}
if (typeof g.global === "undefined") {
  g.global = globalThis;
}
