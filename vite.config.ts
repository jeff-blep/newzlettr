import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Vite dev server; proxy /api/* → backend set via env VITE_API_ORIGIN
// This avoids hard-coding localhost in the repo. Example:
//   VITE_API_ORIGIN=http://127.0.0.1:3001 npm run dev
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const API = env.VITE_API_ORIGIN; // no fallback → forces explicit config in dev

  if (!API) {
    throw new Error(
      "VITE_API_ORIGIN is required for dev proxy (e.g., http://127.0.0.1:3001)"
    );
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": { target: API, changeOrigin: true },

        // compatibility for any legacy calls without /api
        "/config": {
          target: API,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/config/, "/api/config"),
        },
        "/test-plex": {
          target: API,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/test-plex/, "/api/test-plex"),
        },
        "/test-tautulli": {
          target: API,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/test-tautulli/, "/api/test-tautulli"),
        },
        "/test-email": {
          target: API,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/test-email/, "/api/test-email"),
        },
        "/send": {
          target: API,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/send/, "/api/send"),
        },
      },
    },
  };
});
