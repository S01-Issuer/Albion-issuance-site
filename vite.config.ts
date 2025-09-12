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
