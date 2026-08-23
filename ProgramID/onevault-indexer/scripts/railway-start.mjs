#!/usr/bin/env node
/**
 * Railway entrypoint: migrate → poller (background) → API (foreground, binds PORT).
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "..", "dist");

function run(script, args = [], opts = {}) {
  return spawn(process.execPath, [path.join(dist, script), ...args], {
    stdio: "inherit",
    env: process.env,
    ...opts,
  });
}

async function main() {
  console.log("[railway] migrate…");
  const mig = run("migrate.js");
  const migCode = await new Promise((resolve) => mig.on("exit", resolve));
  if (migCode !== 0) {
    console.error("[railway] migrate failed", migCode);
    process.exit(migCode ?? 1);
  }

  const runPoller = (process.env.RUN_POLLER ?? "1") !== "0";
  if (runPoller) {
    console.log("[railway] starting poller…");
    const poller = run("index.js");
    poller.on("exit", (code) => {
      console.error("[railway] poller exited", code);
      process.exit(code ?? 1);
    });
  } else {
    console.log("[railway] RUN_POLLER=0 — API only");
  }

  console.log("[railway] starting API on PORT=%s", process.env.PORT ?? process.env.API_PORT ?? "3001");
  const api = run("api/server.js");
  api.on("exit", (code) => process.exit(code ?? 0));

  const shutdown = (sig) => {
    console.log("[railway] %s — shutting down", sig);
    api.kill("SIGTERM");
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
