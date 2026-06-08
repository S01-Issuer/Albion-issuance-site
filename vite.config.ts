import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  plugins: [sveltekit()],
  resolve: {
    conditions: ["browser"],
    alias:
      mode === "test"
        ? {
            ws: path.resolve(__dirname, "src/e2e/shims/ws.ts"),
            ethers: path.resolve(__dirname, "src/e2e/shims/ethers.ts"),
            // sveltekit() doesn't supply $env/dynamic/public under vitest; shim
            // it so network.ts can load. (Static is provided / per-spec mocked.)
            "$env/dynamic/public": path.resolve(
              __dirname,
              "src/e2e/shims/env-dynamic-public.ts",
            ),
          }
        : {},
  },
  test: {
    include: [
      "src/**/*.{test,spec}.{js,ts,jsx,tsx}",
      "src/e2e/**/*.{test,spec}.{js,ts}",
    ],
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/e2e/setup.ts"],
  },
}));
