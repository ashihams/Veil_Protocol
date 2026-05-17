/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STEALTH_CONTRACT_ADDRESS?: string;
  readonly VITE_STEALTH_KEY_REGISTRY_ADDRESS?: string;
  readonly VITE_STEALTH_SEND_ADDRESS?: string;
  readonly VITE_ANNOUNCEMENT_LOG_ADDRESS?: string;
  readonly VITE_AGENT_SERVER_URL?: string;
  readonly VITE_X402_SECRET?: string;
  readonly VITE_MIDNIGHT_INDEXER_HTTP?: string;
  readonly VITE_MIDNIGHT_INDEXER_WS?: string;
  readonly VITE_MIDNIGHT_PROVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
