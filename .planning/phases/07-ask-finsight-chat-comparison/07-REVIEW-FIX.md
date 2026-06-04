---
phase: 07-ask-finsight-chat-comparison
fixed_at: 2026-06-04T23:38:00Z
review_path: .planning/phases/07-ask-finsight-chat-comparison/07-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-06-04T23:38:00Z
**Source review:** .planning/phases/07-ask-finsight-chat-comparison/07-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (1 Critical, 2 Warning — Info findings IN-01/IN-02 out of scope)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### CR-01: Comparison winner is delegated to Gemini, not derived deterministically (AI-invariant violation)

**Files modified:** `apps/api/src/ai/ai.service.ts`, `apps/api/src/ai/prompts/compare-system.prompt.ts`, `apps/api/src/ai/__tests__/ai.service.compare.spec.ts`, `apps/web/src/app/(app)/compare/components/__tests__/verdict-card.test.tsx`
**Commit:** 57434c8
**Applied fix:** The winner is now computed server-side as a deterministic argmax over the pre-loaded FinSight Scores (`[...scores].sort((a,b) => b.value - a.value || a.symbol.localeCompare(b.symbol))[0]`), with a documented tie-break (higher score wins; on an exact tie the alphabetically-first symbol wins). Gemini's emitted `winnerSymbol` is now discarded exactly like its `scoreDelta` — the schema enum remains as belt-and-braces only. `buildComparePrompt` now takes the server-derived winner and passes it into the prompt so Gemini writes the rationale about the correct instrument. `scoreDelta = winner.value - ranked[1].value` is therefore always `>= 0`. The runtime `compare_winner_not_in_inputs` membership throw was removed (Gemini's symbol is no longer trusted). The compare spec test that asserted Gemini's out-of-set winner throws was repurposed to assert the server-derived argmax is returned instead, plus new tests for the lower-scoring-pick override and the alphabetical tie-break. The web `verdict-card` test was renamed from "zero or negative delta" to "zero delta (tied scores)" since a negative delta is no longer representable; the zero-delta assertion is retained and the component required no change (`deltaPositive = scoreDelta > 0` already handles 0).

### WR-01: Comparison rationale is verb-sanitised but never numeric-audited (hallucinated-figure gap)

**Files modified:** `apps/api/src/ai/ai.service.ts`, `apps/api/src/ai/__tests__/ai.service.compare.spec.ts`
**Commit:** 2e7b172
**Applied fix:** After the forbidden-verb sanitiser, the rationale is now run through the same `auditNumbers()` used by `narrative()`/`swot()` against a verified value set. A new private `buildCompareVerifiedValues()` emits every score, every pillar value, and the delta in three canonical forms (`String(v)`, `toFixed(1)`, `toFixed(2)`) so a faithful rationale citing `8.0` is not wrongly rejected because `String(8.0) === "8"`. On an audit miss (compare is one-shot, so no retry loop), the prose is replaced by a deterministic, figure-safe template rationale built only from verified numbers (`buildCompareFallbackRationale()`). Two new tests exercise the audit: a positive case (rationale citing only verified figures is preserved) and a negative case (a hallucinated `99` triggers the template fallback). The positive test is what guards the `"8"` vs `"8.0"` canonical-form trap.

### WR-02: Thrown NO_SCORE_YET ToolError is not mapped to 422 (only the returned PendingScoreResponse is)

**Files modified:** `apps/api/src/chat/compare.controller.ts`, `apps/api/src/chat/__tests__/compare.controller.spec.ts`
**Commit:** b9d853b
**Applied fix:** The controller now wraps the service call in try/catch and maps a thrown `ToolError` with `code === "NO_SCORE_YET"` to a 422 `{ error: "SCORE_PENDING", symbol }` response, keeping it consistent with the returned-shape path. The offending symbol is read from `err.message` (NOT a non-existent `err.symbol` — `ToolError` only carries `code` and `message`, and the test constructs `new ToolError("NO_SCORE_YET", "NEWCO.NS")` so the symbol is the message). The controller spec's thrown-ToolError test was tightened from `expect(status).toBeGreaterThanOrEqual(400)` (which masked the 500) to `expect(status).toBe(422)` plus an exact-body assertion. A throttler-storage reset was added to the spec's `beforeEach` because the tightened status assertion surfaced cross-test rate-limit pollution from the 10/min throttle test (the old `>= 400` assertion had hidden it by also accepting 429).

## Verification

- `cd apps/api && npx vitest run ai.service.compare compare.controller` → 19 passed (2 files)
- `cd apps/api && npx tsc --noEmit` → exit 0, clean
- `cd apps/web && npx vitest run verdict-card` → 4 passed

---

_Fixed: 2026-06-04T23:38:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
