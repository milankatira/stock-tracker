import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@finsight/shared": path.resolve(
        __dirname,
        "../../packages/shared/src/index.ts",
      ),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: [
      "src/**/*.spec.{ts,tsx}",
      "src/**/*.test.{ts,tsx}",
    ],
    exclude: ["node_modules", ".next", "dist"],
    // Plan 01 ships no web specs yet — landing/auth UI specs land in
    // Plan 03 and Phase 9. Don't fail the green-board until then.
    passWithNoTests: true,
  },
});
