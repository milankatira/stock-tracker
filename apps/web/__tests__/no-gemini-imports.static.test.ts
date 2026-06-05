import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Layer 1 of the three-layer model-SDK ban (SEO-04).
 *
 * The plan specified an ESLint `no-restricted-imports` fence in
 * `apps/web/eslint.config.mjs`. That file is blocked by the repo's
 * config-protection hook (any create/edit of `eslint.config.mjs` is
 * rejected), so the static-import guarantee is delivered here instead as a
 * source-text scan. This is a genuinely independent check:
 *   Layer 1: this static file scan (asserts no SDK import in source text)
 *   Layer 2: the CI `git grep` step in .github/workflows/ci.yml
 *   Layer 3: the runtime Vitest mock-throw tests (page render never
 *            instantiates the SDK)
 *
 * NOTE: This file lives under `__tests__/`, NOT under `src/app/stock` or
 * `src/app/fund`, so the Layer-2 CI grep (which scans only those route
 * trees) does not self-trip on the literal SDK string used below.
 */
const WEB_ROOT = path.resolve(__dirname, "..");

const GUARDED_FILES = [
  "src/app/stock/[ticker]/page.tsx",
  "src/app/fund/[schemeCode]/page.tsx",
  "src/components/reports/public-stock-report-view.tsx",
  "src/components/reports/public-fund-report-view.tsx",
  "src/components/reports/stub-page.tsx",
];

// Reconstructed at runtime so this very test file does not contain the
// literal banned string (defence against accidental self-matching greps).
const BANNED_SDK = ["@google", "genai"].join("/");
const BANNED_PATTERN = new RegExp(`from\\s+["'\`]${BANNED_SDK}|require\\(["'\`]${BANNED_SDK}`);

describe("Public SEO route trees never import the live model SDK (SEO-04, Layer 1)", () => {
  for (const rel of GUARDED_FILES) {
    it(`${rel} has no model-SDK import`, () => {
      const abs = path.join(WEB_ROOT, rel);
      // Files are created in Tasks 2/3 — once present they must stay clean.
      if (!existsSync(abs)) {
        throw new Error(
          `Guarded file missing: ${rel}. It must exist and be SDK-free.`,
        );
      }
      const source = readFileSync(abs, "utf8");
      expect(BANNED_PATTERN.test(source)).toBe(false);
    });
  }
});
