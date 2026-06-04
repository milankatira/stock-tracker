---
phase: 07-ask-finsight-chat-comparison
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - apps/api/src/ai/__tests__/ai.service.compare.spec.ts
  - apps/api/src/ai/ai.service.ts
  - apps/api/src/ai/prompts/compare-system.prompt.ts
  - apps/api/src/app.module.ts
  - apps/api/src/chat/__tests__/compare.controller.spec.ts
  - apps/api/src/chat/compare.controller.ts
  - apps/api/src/chat/compare.module.ts
  - apps/api/src/chat/compare.service.ts
  - apps/api/src/chat/dto/compare.dto.ts
  - apps/web/src/app/(app)/compare/components/__tests__/verdict-card.test.tsx
  - apps/web/src/app/(app)/compare/components/compare-picker.tsx
  - apps/web/src/app/(app)/compare/components/score-table.tsx
  - apps/web/src/app/(app)/compare/components/verdict-card.tsx
  - apps/web/src/app/(app)/compare/page.tsx
  - apps/web/src/app/(app)/compare/result/page.tsx
  - apps/web/src/lib/compare-api.ts
  - packages/shared/src/comparison.ts
  - packages/shared/src/index.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-06-04
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Plan 07-04 ships a clean, well-structured 2-3-way comparison feature: a separate `CompareController`/`CompareService`/`CompareModule` (correctly decoupled from the SSE chat path), a one-shot structured-output Gemini call in `AiService.compare`, and a server-rendered Next.js `/compare` UI. The wiring is solid — auth (`AccessTokenGuard`), per-user throttling (`@Throttle 10/60s`), the global `ValidationPipe({ whitelist, forbidNonWhitelisted })`, the injection-fencing DTO regex, the mandatory disclaimer, and no hardcoded secrets are all in place and tested.

However, there is **one CRITICAL AI-invariant violation**: the *winner* of the comparison is decided by Gemini and only checked for set-membership — it is never derived deterministically from the scores the engine already computed. This lets Gemini name the lower-scoring instrument as the "Higher-scoring pick," producing a negative `scoreDelta` and a user-facing wrong verdict. The negative-delta path is currently mistaken for a cosmetic edge case (and is even encoded as expected behavior in a test) when it is actually the fingerprint of this bug. A secondary WARNING is that the `rationale` prose is verb-sanitised but not numeric-audited, leaving a hallucinated-figure gap that the narrative/SWOT paths already close with `auditNumbers`.

## Critical Issues

### CR-01: Comparison winner is delegated to Gemini, not derived deterministically (AI-invariant violation)

**File:** `apps/api/src/ai/ai.service.ts:298,316,324-331`
**Issue:**
The winner is a pure `argmax` over deterministic FinSight Scores that the scoring engine already produced — it is a metric-derived decision and, per the NON-NEGOTIABLE AI invariant ("Gemini NEVER generates a number / metric-derived decision"), must be computed server-side. Instead, `compare()` accepts Gemini's `winnerSymbol` and only validates set-membership (`symbols.includes(parsed.winnerSymbol)`), never that it is actually the highest-scoring symbol.

Failure trace: Gemini returns the *lower*-scoring symbol (still a member of the input set) → the membership check passes → `winner` becomes that lower symbol → `maxOther = max(other scores)` is the genuinely higher score → `scoreDelta = winner.value - maxOther` is **negative**, and the UI (`verdict-card.tsx`) labels the lower-scoring stock "Higher-scoring pick … vs next-best." A negative delta is *only* reachable when Gemini picks wrong, so it is the symptom of this bug, not a benign edge case.

Note that scores are integers 1–10 (`packages/shared/src/scoring.ts` uses `Math.round`), so ties are frequent and a server-side tie-break must be defined.

The file's own doc comment (lines 267–274) already states `scoreDelta` is "RECOMPUTED server-side and Gemini's emission is discarded" — the identical treatment must apply to `winnerSymbol`.

**Fix:**
```typescript
// Derive the winner deterministically (argmax), discard Gemini's emission —
// same treatment as scoreDelta. Define a stable tie-break (scores are int 1-10).
const ranked = [...scores].sort(
  (a, b) => b.value - a.value || a.symbol.localeCompare(b.symbol),
);
const winner = ranked[0];
const maxOther = ranked[1].value; // 2..3 inputs guaranteed by the guard above
const scoreDelta = Number((winner.value - maxOther).toFixed(2));

// winnerSymbol is now server-derived; Gemini's parsed.winnerSymbol is only a
// hint for the prose and is no longer trusted for the decision.
return {
  winnerSymbol: winner.symbol,
  rationale,
  scoreDelta,
  scores: scores.map((s) => ({ /* … */ })),
};
```
Pass the derived winner into `buildComparePrompt` so the rationale is written about the correct instrument, and update the spec that asserts Gemini's `winnerSymbol` is echoed back. Also remove/repurpose the `verdict-card.test.tsx` "renders a zero or negative delta" case — once the winner is `argmax`, `scoreDelta` is always `>= 0` (ties → 0), so a negative delta should no longer be a representable state.

## Warnings

### WR-01: Comparison rationale is verb-sanitised but never numeric-audited (hallucinated-figure gap)

**File:** `apps/api/src/ai/ai.service.ts:321`
**Issue:**
`compare()` runs the rationale only through `applyReplacements()` (forbidden *verbs*), but unlike `narrative()` and `swot()` it never runs `auditNumbers()` against the known score set. The compare prompt explicitly invites pillar citations ("citing the pillar(s) that drove the gap"), so Gemini prose can introduce figures that were never in the deterministic data ("leads by 2 points," "scores 8.4 on valuation"). Any such number reaching the user is an AI-invariant breach — the same class of risk the narrative path closes with a retry+audit loop.

**Fix:** Run the rationale through the existing numeric audit against the verified score/pillar values before returning, e.g.:
```typescript
const verified = buildVerifiedValues(scores); // symbol→score, pillar values, delta
const audit = auditNumbers(rationale, verified);
if (!audit.ok) {
  // Either retry the Gemini call (as narrative/swot do) or fall back to a
  // deterministic template rationale — never ship unaudited figures.
  this.logger.warn({ unexpected: audit.unexpectedTokens }, "compare_audit_failed");
  // ...retry or template fallback
}
```
At minimum, strip/template numeric tokens; ideally mirror the narrative retry loop.

### WR-02: Thrown `NO_SCORE_YET` ToolError is not mapped to 422 (only the returned PendingScoreResponse is)

**File:** `apps/api/src/chat/compare.controller.ts:34-38`, `apps/api/src/chat/compare.service.ts:34-39`
**Issue:**
The controller special-cases only the *returned* `{ error: "SCORE_PENDING" }` shape. `CompareService.compare` currently returns that shape, so the happy path is fine — but the controller's own doc comment references `ToolError('NO_SCORE_YET')` semantics, and the controller spec (`compare.controller.spec.ts:169-183`) explicitly exercises a *thrown* `ToolError("NO_SCORE_YET")` and asserts only `status >= 400` (i.e. it lands as a 500 via the global filter). A pending score is an expected, non-error condition; surfacing it as a 500 is incorrect contract behavior and would page on a normal "freshly-added instrument" case.

**Fix:** Either keep the service's return-based contract and tighten the test to assert the returned-shape path only, or add an exception mapping so a thrown `ToolError('NO_SCORE_YET', symbol)` is translated to a 422 `PendingScoreResponse` (in the controller catch or a dedicated exception filter), keeping both paths consistent:
```typescript
try {
  const result = await this.compareService.compare(dto.symbols);
  if ("error" in result && result.error === "SCORE_PENDING") res.status(422);
  return result;
} catch (err) {
  if (err instanceof ToolError && err.code === "NO_SCORE_YET") {
    res.status(422);
    return { error: "SCORE_PENDING", symbol: err.symbol };
  }
  throw err;
}
```

## Info

### IN-01: DTO permits unbounded per-symbol length / degenerate all-dot strings

**File:** `apps/api/src/chat/dto/compare.dto.ts:21-24`
**Issue:**
`@Matches(/^[A-Z0-9.]+$/)` correctly blocks prompt injection (no quotes, spaces, or control chars), but imposes no length cap and accepts degenerate values like `"..."` or a 5,000-char symbol. Harmless in practice — such symbols simply miss the score lookup and fall through to a throttled 422 — but a tighter fence documents intent.

**Fix:** Add `@MaxLength(20, { each: true })` and optionally a stricter pattern such as `/^[A-Z0-9]{1,15}\.(NS|BO)$/` to require a real NSE/BSE suffix.

### IN-02: Web internal API base falls back to public env vars

**File:** `apps/web/src/lib/compare-api.ts:15-19`
**Issue:**
`INTERNAL_BASE` resolves `INTERNAL_API_BASE ?? NEXT_PUBLIC_API_BASE ?? NEXT_PUBLIC_API_URL ?? "http://localhost:3001"`. This matches the existing `reports/fetch.ts` pattern (so it is consistent, not a regression), but note that this fetch forwards the `access_token` cookie — confirm the resolved base is always a trusted internal/server origin in production so the session cookie is never sent to a public-facing or misconfigured host.

**Fix:** No change required for parity with existing code; if hardening later, prefer requiring `INTERNAL_API_BASE` server-side and failing fast when unset in production rather than silently falling back to `NEXT_PUBLIC_*`.

---

_Reviewed: 2026-06-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
