import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API is served under /api on the same origin, in dev via this proxy and in
    // production via nginx. Same-origin means no CORS configuration anywhere — the
    // browser never sees a cross-origin request to preflight.
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
