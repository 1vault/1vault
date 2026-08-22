/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_CLUSTER?: string;
  readonly VITE_PORT?: string;
  readonly VITE_SOLANA_RPC?: string;
  readonly VITE_DEMO_OUTPUT_MINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
