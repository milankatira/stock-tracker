// Flat-config root ESLint setup for the monorepo.
// Each workspace inherits from here; workspace-specific overrides go in
// `apps/*/eslint.config.mjs` if needed.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Global ignore — keep at top so subsequent configs aren't applied to it.
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/*.d.ts",
      "**/next-env.d.ts",
      "**/*.config.{js,mjs,cjs,ts}",
      "**/*.test-d.ts",
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript recommended (non-type-checked — fast lint, IDE catches the rest)
  ...tseslint.configs.recommended,

  // Project-wide rule overrides.
  {
    rules: {
      // We use `unknown` per the rules — but allow narrowed casts.
      "@typescript-eslint/no-explicit-any": "error",
      // We allow empty catch ONLY when the body is a single comment
      // explaining why; rules/common/security.md forbids silent swallow.
      "no-empty": ["error", { allowEmptyCatch: false }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Test files — relax unused-vars + allow `any` in ambient module decls
  {
    files: ["**/*.{spec,test}.{ts,tsx}", "**/test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-empty": "off",
    },
  },

  // Phase 2 architecture fence — provider SDKs (yahoo-finance2,
  // stock-nse-india, rss-parser) may only be imported from the
  // market-data module. Scoring / reports / analysis / narrative code
  // must consume them via the PriceProvider / FundProvider / NewsProvider
  // ports in @finsight/shared so the SDK choice can change without
  // rippling through the domain.
  {
    files: ["apps/api/src/**/*.ts"],
    ignores: [
      "apps/api/src/modules/market-data/**",
      "**/*.spec.ts",
      "**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["yahoo-finance2", "yahoo-finance2/*"],
              message:
                "Use the PriceProvider port from @finsight/shared — yahoo-finance2 is fenced to market-data.",
            },
            {
              group: ["stock-nse-india", "stock-nse-india/*"],
              message:
                "Use the PriceProvider / CORPORATE_ACTIONS_PROVIDER from @finsight/shared — stock-nse-india is fenced to market-data.",
            },
            {
              group: ["rss-parser", "rss-parser/*"],
              message:
                "Use the NewsProvider port from @finsight/shared — rss-parser is fenced to market-data.",
            },
          ],
        },
      ],
    },
  },

  // Phase 4 architecture fence (COMP-02) — AiService is the single
  // compliance chokepoint. Only the BullMQ jobs layer + the chat
  // controller may import it; every other module must go through the
  // narrative-batch processor (Plan 04-02) or the report read path.
  // @google/genai is fenced to the ai module to prevent bypassing
  // ComplianceInterceptor via a direct SDK call.
  //
  // Transitional carve-out: apps/api/src/modules/narrative/** is the
  // pre-Phase-4 Gemini wrapper consumed by the existing analysis +
  // saved-report-history flow. Plan 04-02 migrates that consumer onto
  // AiService; until then it keeps direct @google/genai access.
  {
    files: ["apps/api/src/**/*.ts"],
    ignores: [
      "apps/api/src/ai/**",
      "apps/api/src/jobs/**",
      "apps/api/src/chat/**",
      "apps/api/src/modules/narrative/**",
      "**/*.spec.ts",
      "**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/ai/ai.service",
                "**/ai/ai.service.ts",
                "**/ai/gemini.client",
                "**/ai/gemini.client.ts",
              ],
              message:
                "AiService and GeminiClient may only be imported from apps/api/src/jobs/** or apps/api/src/chat/** (COMP-02 chokepoint).",
            },
            {
              group: ["@google/genai", "@google/genai/*"],
              message:
                "@google/genai is fenced to apps/api/src/ai/** — go through AiService to inherit ComplianceInterceptor.",
            },
          ],
        },
      ],
    },
  },
);
