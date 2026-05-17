import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import tailwindcss from "@tailwindcss/vite"
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    'process.env': {},
    global: 'globalThis',
  },
  plugins: [
    TanStackRouterVite(),
    nodePolyfills({
      // To add only specific polyfills, add them here.
      // If no specific polyfills are needed, you can leave this empty.
      include: ['buffer', 'process'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
    wasm(),
    react(),
    viteCommonjs(),
    topLevelAwait(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@eddalabs/stealth-contract/bridge': path.resolve(__dirname, '../stealth-contract/src/bridge/index.ts'),
      '@eddalabs/stealth-contract/crypto/types': path.resolve(__dirname, '../stealth-contract/src/crypto/types.ts'),
      '@agent-server/types': path.resolve(__dirname, '../agent-server/src/types.ts'),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis',
      },
    },
    exclude: [
      "@midnight-ntwrk/onchain-runtime"
    ],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      // Ensure proper handling of Node.js built-ins
      external: [],
    },
  },
  server: {
    fs: {
      // Allow serving files from one level up from the package root
      allow: ['..'],
    },
  },
}))
