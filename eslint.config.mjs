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
);
