---
phase: 07-ask-finsight-chat-comparison
plan: 04
subsystem: api
tags: [gemini, structured-output, responseSchema, comparison, nestjs, nextjs, rsc, compliance]

requires:
  - phase: 07-01
    provides: ToolError('NO_SCORE_YET'), tool.types
  - phase: 07-02
    provides: applyReplacements forbidden-verb sanitiser
  - phase: 04 (reports)
    provides: ReportsService.getStock → StockReportDoc (persisted FinSight Score)
provides:
  - "POST /compare — 2-3-way stock comparison returning { winnerSymbol, rationale, scoreDelta, scores }"
  - "AiService.compare(scores) — one-shot structured-output Gemini verdict (non-streaming)"
  - "ComparisonVerdict/CompareInput/PendingScoreResponse shared types"
  - "Next.js /compare picker + /compare/result verdict UI"
affects: [seo-pages, monetisation, future comparison-of-funds]

tech-stack:
  added: []
  patterns:
    - "Structured-output Gemini call (responseMimeType json + responseSchema enum) for a typed single verdict — distinct from the streaming chat loop"
    - "Score-loading owned by the orchestrating service (CompareService), keeping AiService/AiModule decoupled from read-path modules"
    - "Deterministic numeric override: Gemini-emitted scoreDelta discarded, recomputed server-side (AI invariant)"

key-files:
  created:
    - packages/shared/src/comparison.ts
    - apps/api/src/ai/prompts/compare-system.prompt.ts
    - apps/api/src/chat/compare.controller.ts
    - apps/api/src/chat/compare.service.ts
    - apps/api/src/chat/compare.module.ts
    - apps/api/src/chat/dto/compare.dto.ts
    - apps/web/src/lib/compare-api.ts
    - "apps/web/src/app/(app)/compare/page.tsx"
    - "apps/web/src/app/(app)/compare/result/page.tsx"
    - "apps/web/src/app/(app)/compare/components/{compare-picker,verdict-card,score-table}.tsx"
  modified:
    - apps/api/src/ai/ai.service.ts
    - apps/api/src/app.module.ts
    - packages/shared/src/index.ts

key-decisions:
  - "AiService.compare takes pre-loaded scores (Option B), not symbols — score-loading lives in CompareService via ReportsService.getStock, mirroring ChatService's ToolContext pattern and preserving the COMP-02 chokepoint decoupling."
  - "scoreDelta is recomputed deterministically server-side; Gemini's emission is discarded (AI invariant)."
  - "compare.controller.ts is a SEPARATE controller from chat.controller.ts to allow Wave-3 parallelism with Plan 03."

patterns-established:
  - "Single-verdict structured-output path: generateContent + responseSchema(enum-constrained winner) for typed, compliance-safe output by construction."
  - "Orchestrator-owns-data-loading: pure AiService method + service that loads deterministic inputs."

requirements-completed: [STOCK-07]

duration: 35min
completed: 2026-06-04
---

# Phase 7 Plan 04: Stock Comparison Verdict Summary

**STOCK-07: a non-streaming `POST /compare` that returns a typed `ComparisonVerdict` — Gemini writes only the sanitised prose rationale while the winner is enum-constrained and the score delta is recomputed server-side; plus a Next.js compare picker + verdict card UI.**

## Performance
- **Duration:** ~35 min
- **Tasks:** 3
- **Files created:** 11 · **Files modified:** 3

## Accomplishments
- `AiService.compare(scores)`: one-shot `generateContent` with `responseSchema` (winner enum-constrained to input symbols, rationale maxLength 400), rationale sanitised via `applyReplacements`, `scoreDelta` recomputed deterministically.
- `CompareModule` (`POST /compare`): `CompareDto` (2-3 symbols, `/^[A-Z0-9.]+$/` anti-injection fence), cookie-JWT auth, 10/min throttle, 422 `SCORE_PENDING` for missing scores.
- Next.js `/compare` picker (2-3 stock multi-select) + `/compare/result` RSC rendering `VerdictCard` + `ScoreTable` or a friendly score-pending card.

## Task Commits
1. **Task 1: Shared types + AiService.compare** — `e699dfa` (feat)
2. **Task 2: CompareModule (controller/service/DTO/module) + e2e** — `566eae6` (feat)
3. **Task 3: Next.js compare UI** — `92e71e5` (feat)

## Final `ComparisonVerdict` shape
```ts
interface ComparisonVerdict {
  winnerSymbol: string;                 // ∈ input symbols (schema enum + re-check)
  rationale: string;                    // ≤400 chars, sanitised prose (Gemini)
  scoreDelta: number;                   // winnerScore - max(otherScores), 2dp — server-computed
  scores: { symbol; value; verdict: Verdict; asOfDate }[];
}
interface PendingScoreResponse { error: 'SCORE_PENDING'; symbol: string; }
```

## How `scoreDelta` is computed (key compliance detail for the next AI engineer)
`responseSchema` requires Gemini to emit `scoreDelta`, but the value is **discarded**. After parsing, the server finds the winner's persisted score and `max()` of the other persisted scores and computes `Number((winner - maxOther).toFixed(2))`. Gemini never contributes a number — only the prose `rationale`. This honours the PROJECT.md AI invariant and is proven by `ai.service.compare.spec.ts` test 6 (Gemini emits `999`, response is the correct deterministic value).

## Behaviour on partial-score input
If any input symbol has no persisted `StockReportDoc`, `CompareService.compare` short-circuits to `{ error: 'SCORE_PENDING', symbol }` (the first missing symbol) — the model is never called. `CompareController` surfaces this as HTTP **422**. The `/compare/result` page renders a "Score pending for {symbol} … try again tomorrow" card rather than dead-ending.

## Why a separate controller
`compare.controller.ts` / `compare.service.ts` are intentionally distinct from `chat.controller.ts` / `chat.service.ts` so this plan ships parallel with Plan 03 (chat history) without file conflicts. Comparison is a single structured verdict, not a conversation, so it does not share the SSE chat path. The only shared file, `ai.service.ts`, gained a NON-overlapping `compare()` method.

## Deviations from Plan

### Reconciliations (plan text vs. real codebase)

**1. [Rule 3 - Blocking] `stocksRepo.getLatestScore` does not exist — used `ReportsService.getStock`**
- **Found during:** Task 1/2.
- **Issue:** The plan's `<interfaces>` block assumed `stocksRepo.getLatestScore(symbol)` returning `{ value, verdict, pillars, computedAt, dataVersionHash }`. There is no `stocks.repo.ts` (Plan 01 SUMMARY flagged this); the real read path is `ReportsService.getStock(ticker): StockReportDoc | null` with `doc.score.{value,verdict,pillars}` and `doc.asOf` (already an ISO string — no `.computedAt.toISOString()`).
- **Fix:** `CompareService` injects `ReportsService` and maps `getStock` → `CompareScoreContext`. `AiService.compare` takes pre-loaded scores (Option B), keeping `AiModule` free of read-path module deps (mirrors `ChatService`'s `ToolContext` pattern).
- **Committed in:** e699dfa, 566eae6.

**2. [Rule 1 - Bug] e2e test mock target moved to CompareService**
- **Issue:** The plan said "override `AIService.compare`". With score-loading in `CompareService`, mocking `AiService.compare` would never be reached (the controller calls `CompareService`). Mocking `CompareService.compare` is the correct seam and lets us drive 200/422 deterministically.
- **Fix:** `compare.controller.spec.ts` mocks `CompareService.compare`; 422 driven by returning a `PendingScoreResponse`.

**3. [Rule 3 - Blocking] Test filename `*.e2e-spec.ts` is unrunnable; auth guard is `AccessTokenGuard`**
- **Issue:** `src/**/*.e2e-spec.ts` matches neither the default vitest include (`*.spec.ts` — the hyphen breaks the glob) nor the e2e config (`test/**/*.e2e-spec.ts`). Also the plan referenced `JwtAuthGuard`; the real guard is `AccessTokenGuard` and the throttler uses `@Throttle` + `ThrottlerGuard`.
- **Fix:** Renamed to `compare.controller.spec.ts` (runs under the default suite, no Mongo bootstrap needed since fully mocked); used `AccessTokenGuard` overridden by a header-driven stub guard, and `ThrottlerModule.forRoot` for the 429 test.

**4. [Rule 3 - Blocking] Shared type path / web fetch shape**
- **Issue:** Shared types live in `packages/shared/src/*.ts` (no `types/` subdir). The plan's web `compare-api.ts` used a client `fetch('/api/compare')`; the real RSC pattern (`_lib/reports/fetch.ts`) is a server-only fetch forwarding the `access_token` cookie to `INTERNAL_BASE`.
- **Fix:** `comparison.ts` at `packages/shared/src/` + barrel export; `compare-api.ts` is server-only with cookie forwarding.

---
**Total deviations:** 4 reconciliations (3 blocking, 1 bug). All driven by the plan's literal text diverging from the real codebase; no scope creep. Verified against primary sources (Plan 01 SUMMARY, actual service signatures).

## Issues Encountered
- **Environment (out of scope, not committed):** the active Node binary (`/Applications/Codex.app/.../node` v24) refuses to `dlopen` the rollup native `.node` (Team-ID code-signature mismatch), breaking vitest/next under the worktree's symlinked `node_modules`. Worked around by running all verifications with the system Homebrew node (`/opt/homebrew/bin/node`) which loads the binary cleanly. No repo changes; logged here for the orchestrator's hook-validation pass.

## Verification (all green)
- `ai.service.compare.spec.ts` 6/6, `compare.controller.spec.ts` 9/9 (incl. 429 throttle, 422 pending, 401, sanitised rationale).
- Existing ai.service specs (chat-stream/sentiment/spec) 18/18 — no regression.
- `apps/api tsc --noEmit` clean; `apps/web tsc --noEmit` clean.
- `verdict-card.test.tsx` 4/4; `apps/web next build` succeeds (`/compare` static, `/compare/result` dynamic).

## Next Phase Readiness
- STOCK-07 delivered. Comparison endpoint + UI ready. Fund-vs-fund comparison and SEO-indexable compare pages are natural follow-ons (not in scope here).

## Self-Check: PASSED

---
*Phase: 07-ask-finsight-chat-comparison*
*Completed: 2026-06-04*
