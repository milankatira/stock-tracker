import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.spec.ts", "src/**/*.spec.ts"],
    exclude: ["node_modules", "dist", "**/*.{js,cjs,mjs}"],
    setupFiles: ["./test/setup.ts"],
    typecheck: {
      enabled: false,
      include: ["test/**/*.test-d.ts"],
    },
  },
});
