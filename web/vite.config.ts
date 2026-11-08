import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = process.env.NEWZLETTR_API ?? "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": api,
      "/email-assets": api,
      "/ping": api,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
