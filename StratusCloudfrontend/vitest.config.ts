import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const rootDir = path.resolve(__dirname);

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [path.resolve(rootDir, "src/test/setup.ts")],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    testTimeout: 30000,
    // Mock ?url imports so WASM binary fetch doesn't hang in jsdom
    server: {
      deps: {
        inline: ["@noble/ciphers", "@noble/hashes", "@noble/curves"],
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(rootDir, "src") },
  },
  // In test env, ?url imports return a stub path instead of trying to fetch
  assetsInclude: ["**/*.wasm"],
});
