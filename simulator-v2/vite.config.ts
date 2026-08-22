import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.VITE_BACKEND_URL ?? "http://127.0.0.1:3090";

  return {
    plugins: [
      react(),
      nodePolyfills({
        include: ["buffer"],
        globals: { Buffer: true },
      }),
    ],
    server: {
      port: Number(env.VITE_PORT ?? 5174),
      host: true,
      proxy: {
        "/v1": {
          target: backend,
          changeOrigin: true,
          timeout: 0,
          proxyTimeout: 0,
        },
      },
    },
  };
});
