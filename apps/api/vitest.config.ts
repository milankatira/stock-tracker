import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";
import path from "node:path";

/**
 * Vitest config for the NestJS API.
 *
 * - `unplugin-swc` compiles TS + decorator metadata so `@Controller`,
 *   `@Injectable`, etc. work in tests without ts-jest.
 * - `setupFiles` is intentionally empty in Plan 01; Plan 01 Task 3 lands
 *   `test/setup.ts` (mongodb-memory-server + ioredis-mock). Tests that
 *   touch Mongo/Redis live in later plans.
 */
export default defineConfig({
  plugins: [
    // Run SWC before Vitest's default esbuild so legacy decorators + metadata
    // are emitted (required by NestJS DI).
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@finsight/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    exclude: ["test/**/*.e2e-spec.ts", "node_modules", "dist"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    snapshotSerializers: ["./src/scoring/__test-utils__/decimal-serializer.ts"],
  },
});
