import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./manifest.config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Ensure `window` exists before any SW chunk that touches Solana web3.js. */
function swWindowPolyfill(): Plugin {
  const apply = () => {
    const outDir = path.resolve(rootDir, "dist");
    const loaderPath = path.join(outDir, "service-worker-loader.js");
    if (!fs.existsSync(loaderPath)) return;

    const polyfillName = "sw-window-polyfill.js";
    fs.writeFileSync(
      path.join(outDir, polyfillName),
      "globalThis.window ??= globalThis;\nglobalThis.global ??= globalThis;\n"
    );

    let loader = fs.readFileSync(loaderPath, "utf8");
    if (!loader.includes(polyfillName)) {
      loader = `import './${polyfillName}';\n` + loader;
      fs.writeFileSync(loaderPath, loader);
    }
  };

  return {
    name: "sw-window-polyfill",
    enforce: "post",
    writeBundle() {
      apply();
    },
    closeBundle() {
      // CRX may rewrite the loader after writeBundle — patch again.
      apply();
      setTimeout(apply, 50);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["buffer"],
      globals: { Buffer: true },
    }),
    crx({ manifest }),
    swWindowPolyfill(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  build: {
    // Inline sourceMappingURL comments break IIFE-wrapped content scripts: the
    // //# comment eats the closing })() and Chrome throws "Unexpected end of input".
    sourcemap: "hidden",
    codeSplitting: false,
  },
});
