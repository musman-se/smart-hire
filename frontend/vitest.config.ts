import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

// Kept apart from vite.config.ts so the production build never loads Vitest.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      // Styles do not affect behaviour under jsdom; skipping them keeps runs fast.
      css: false,
    },
  }),
);
