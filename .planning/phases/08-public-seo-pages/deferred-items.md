# Phase 08 — Deferred Items (out of scope for plan 08-02)

Discovered during 08-02 execution. NOT caused by 08-02 changes. Do not fix here.

## Pre-existing: `schema-dts` declared but not installed

- **File:** `apps/web/src/lib/seo/jsonld.ts:20` — `Cannot find module 'schema-dts'` (TS2307).
- **Cause:** `apps/web/package.json` lists `"schema-dts": "1.1.5"` (added in Wave 1, plan 08-01) but the dependency was never installed into `node_modules` (`pnpm install` not run for it). Reproduces in the MAIN checkout too, so it predates this worktree.
- **Impact:** `tsc --noEmit` reports this single error against a Wave-1 file. The 08-01 SUMMARY claimed `tsc` clean — the install step was likely skipped after adding the dep.
- **Fix (future / 08-01 follow-up):** run `pnpm install` in the repo root so the workspace resolves `schema-dts@1.1.5`, then re-verify `tsc --noEmit`.
- **Why not fixed in 08-02:** out of scope (Wave-1 file, pre-existing); the SCOPE BOUNDARY rule forbids fixing unrelated pre-existing failures.
