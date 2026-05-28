---
phase: 04-reports-ai-narrative-active-compliance
plan: 01
slug: ai-compliance-foundation
date: 2026-05-28
status: complete
deviations:
  - "ESLint flat config (eslint.config.mjs) instead of legacy .eslintrc.cjs — same fence semantics, repo convention. The rule blocks `**/ai/ai.service`, `**/ai/gemini.client`, and the raw `@google/genai` SDK from any file outside `apps/api/src/{ai,jobs,chat}/**`."
  - "Transitional carve-out: `apps/api/src/modules/narrative/**` remains allowed to import `@google/genai` directly because that pre-Phase-4 client backs the existing analysis + saved-report-history flow. Plan 04-02 migrates that consumer onto AiService and then removes the carve-out."
  - "`forbid-verbs.sh` allowlist extended for the new compliance machinery (`apps/api/src/ai/prompts/**`, `compliance.fixtures.ts`, `compliance.sanitiser.ts` + spec, `compliance.interceptor.spec.ts`) because these files legitimately contain the forbidden vocabulary as the very thing they reject."
  - "`GeminiClient` reads `GEMINI_API_KEY` via `ConfigService` (already Zod-validated in `env.schema.ts`) instead of `process.env` directly — matches the Phase 1 fail-loud-at-boot contract end-to-end."
  - "AiService.swot() joins the four quadrant bullets into a single audit string for the numeric audit. This is sufficient because the audit is the gating mechanism — the structured per-quadrant lists are still preserved on the raw Gemini response for downstream rendering (Plan 04-04 / 04-05 will surface the quadrants individually)."
---

## What landed

### Pure libraries

- `apps/api/src/compliance/disclaimers.constants.ts` — `ANALYSIS_DISCLAIMER` + `PAST_PERF_DISCLAIMER` constants tagged with `// TODO(legal-signoff)` markers pending SEBI counsel review (open question #4).
- `apps/api/src/compliance/compliance.fixtures.ts` — fixture pack with `FORBIDDEN_FIXTURES` (10 entries spanning verb / phrase / numeric-target / you-should / target-price / stop-loss matches), `NEUTRAL_FIXTURES` (6 entries — false-positive guard), `EVASION_FIXTURES` (3 entries — regression markers for the A5 v1 evasion gap).
- `apps/api/src/compliance/compliance.sanitiser.ts` — `sanitiseAndCheck(text)` runs 7 regex patterns (verb blocklist, you-should, strongly-suggest, target-price, stop-loss, our-recommendation, numeric rupee target). Returns `{ sanitised, violations, matches }`. v1 BLOCKS — never auto-replaces.
- `apps/api/src/ai/numeric-audit.ts` — `auditNumbers(narrative, verified)` flags any `-?\d+(?:[.,]\d+)?%?` token not present (with or without `%` suffix) in the verified set. Canonicalises commas so `1,500` and `1500` match.
- `apps/api/src/ai/template-slots.ts` — `substituteSlots(paragraph, values)` + `UnknownPlaceholderError`. Whitespace-tolerant `{{ key }}` matching.

### ComplianceInterceptor (COMP-02 chokepoint)

- `apps/api/src/compliance/compliance.interceptor.ts` — `ComplianceInterceptor implements NestInterceptor` runs `sanitiseAndCheck` on the AI output text. On violations → throws `ComplianceViolationException extends BadRequestException` (carries the matched rule labels). On clean output → returns `{ text, citedSources, disclaimers: { analysis, pastPerformance? } }`. `pastPerformance` populated only when `touchesReturns === true`.
- `apps/api/src/compliance/compliance.module.ts` — Nest module providing + exporting the interceptor.
- Spec verifies: clean payload disclaimers, conditional pastPerformance branch, throw on every `FORBIDDEN_FIXTURES` entry, pass on every `NEUTRAL_FIXTURES` entry, non-AI-shaped values pass through unchanged, underlying-handler errors propagate.

### AiModule (single chokepoint)

- `apps/api/src/ai/ai.types.ts` — `AiOutput`, `NarrativeResult`, `SwotResult`, `NarrativeAuditFailedError`.
- `apps/api/src/ai/prompts/narrative.prompt.ts` — `NARRATIVE_RESPONSE_SCHEMA` (object → `paragraph`/`placeholders`/`citedSources`) + `NARRATIVE_SYSTEM_PROMPT` with the 6 absolute rules.
- `apps/api/src/ai/prompts/swot.prompt.ts` — `SWOT_RESPONSE_SCHEMA` (4 quadrants + citedSources) + `SWOT_SYSTEM_PROMPT`.
- `apps/api/src/ai/gemini.client.ts` — `GeminiClient` reads `GEMINI_API_KEY` from `ConfigService` (fail-loud throw on missing) and instantiates `new GoogleGenAI({ apiKey })`. **Private** — exposed inside `AIModule` but not in `exports[]`.
- `apps/api/src/ai/ai.service.ts` — `@Injectable() @UseInterceptors(ComplianceInterceptor)`:
  - `narrative(context, maxRetries = 3)`: calls Gemini with structured JSON schema, runs `substituteSlots` + `auditNumbers` per attempt, retries up to 3 times on placeholder or audit failure, throws `NarrativeAuditFailedError` on final exhaustion.
  - `swot(context, maxRetries = 3)`: parallel structure; audits the joined four-quadrant bullets.
  - `buildSwotResult(raw)`: helper that surfaces the structured `SwotResult` for callers that need the per-quadrant breakdown.
- `apps/api/src/ai/ai.module.ts` — imports `ConfigModule` + `ComplianceModule`. Providers: `GeminiClient`, `AiService`. **Exports: only `AiService`** (GeminiClient deliberately omitted).

### ESLint architecture fence (`eslint.config.mjs`)

New `no-restricted-imports` block scoped to `apps/api/src/**/*.ts` with the `ai/`, `jobs/`, `chat/`, `modules/narrative/` (transitional), and spec/test directories carved out. Blocks:
- `**/ai/ai.service` + `**/ai/gemini.client` (anywhere else than the carve-out → error).
- `@google/genai` (anywhere else than the carve-out → error).

Verified end-to-end by dropping a `uses-ai-fence-fixture.ts` under `apps/api/src/modules/analysis/` containing `import { AiService } from '../../ai/ai.service'` — `pnpm --filter @finsight/api lint` failed with the expected `no-restricted-imports` error. Fixture deleted.

### Module wiring

- `apps/api/src/app.module.ts` adds `AiModule` + `ComplianceModule` to the root imports.
- The existing pre-Phase-4 `NarrativeModule` (used by analysis + saved-report-history) is left untouched — Plan 04-02 will migrate it onto `AiService` and then the ESLint carve-out for `modules/narrative/**` can be removed.

### Tests

| File | Coverage |
|------|----------|
| `compliance.sanitiser.spec.ts` (24) | Every FORBIDDEN fixture flagged, every NEUTRAL fixture allowed, EVASION fixtures explicitly passing as the A5 regression marker, specific rule-label mappings, case-insensitivity, word-boundary, empty-input edge case. |
| `numeric-audit.spec.ts` (7) | Suffixed/un-suffixed parity, fabricated numbers flagged, comma canonicalisation, negative percentages, currency tokens, empty narrative. |
| `template-slots.spec.ts` (8) | Single + multi-placeholder, repeated occurrences, unchanged input on no placeholders, `UnknownPlaceholderError` with the offending key, whitespace tolerance, empty-input edge case. |
| `compliance.interceptor.spec.ts` (8) | Clean payload disclaimers, pastPerformance conditional, throw on every forbidden fixture, pass on every neutral fixture, non-AI value passthrough, underlying-error propagation, exception carries violation labels. |
| `ai.service.spec.ts` (7) | Happy-path substitution, retry on unknown placeholder → success, retry on audit miss → success, retry-budget exhaustion → `NarrativeAuditFailedError`, non-placeholder errors rethrown, SWOT audit pass, SWOT audit fail. |

## Cross-phase contracts emitted

- `AiService.narrative()` + `AiService.swot()` — consumed by Plan 04-02's narrative-batch processor, Phase 7 chat, Phase 6 sentiment surface. Single chokepoint, single retry policy.
- `AiOutput` shape — the interceptor's input contract. Future call sites must return at minimum `{ text: string, citedSources?: string[], touchesReturns?: boolean }`.
- `ComplianceViolationException` — `BadRequestException` subclass with `forbidden: string[]`. Phase 1's global exception filter already maps `BadRequestException` to HTTP 400; SUMMARY notes that the filter must NOT echo the `forbidden` array to clients (server-side log only).
- `disclaimers.constants.ts` — placeholder copy until legal sign-off. Single source of truth so a copy update is one-file.

## Pinned deps (none added)

`@google/genai@^2.6.0` was already installed for the Phase 1 narrative client. No new runtime deps from this plan.

## Verification (at commit time)

| Gate | Result |
|------|--------|
| `pnpm --filter @finsight/api test` | **426 pass** (68 files; up from 369) |
| `pnpm --filter @finsight/api test:e2e` | 16 pass |
| `pnpm --filter @finsight/api type-check` | clean |
| `pnpm --filter @finsight/api lint` | clean |
| `pnpm --filter @finsight/api lint:arch` | clean |
| `pnpm --filter @finsight/web test` | 15 pass |
| `pnpm forbid-verbs` | clean (with documented Phase 4 carve-outs) |
| `git diff --check` | clean |
| ESLint fence end-to-end | verified — dropping a cross-boundary `import { AiService }` produces the expected `no-restricted-imports` error |

## Open questions (carry forward)

- **#4 — disclaimer wording.** Final copy pending SEBI counsel sign-off. `disclaimers.constants.ts` has `// TODO(legal-signoff)` markers; downstream UI plans (04-04 / 04-05) consume the constants directly so the future sign-off is a single-file diff.
- **#5 — retry budget.** Implemented as `AiService.MAX_RETRIES = 3` per the plan recommendation; reachable via the `maxRetries` parameter for callers that want to override (e.g. the narrative-batch processor in 04-02 may want a smaller budget per call but more aggressive job-level retries).
- **A5 — sanitiser evasion.** `EVASION_FIXTURES` documents three known v1 gaps. Phase 7 chat may require ML-based detection to close them. The regression suite explicitly asserts the current pass-through so any tightening lands as a deliberate green→red snapshot diff.
- **`forbidden` leak in HTTP errors.** The global exception filter MUST NOT echo `ComplianceViolationException.forbidden` to the client. Verified on next pass — out of scope for this plan but flagged for the security-review skill.

## What this plan defers

- Plan 04-02 — narrative-batch BullMQ job that actually invokes `AiService.narrative()` with a deterministic-fallback path on `NarrativeAuditFailedError`. Migrates the existing `NarrativeModule` consumer onto `AiService` and removes the transitional ESLint carve-out.
- Plan 04-03 / 04-04 / 04-05 — stock report API + page + MF report end-to-end (consume the narrative-batch output via cached reads, never trigger live Gemini calls from a request path).
- Final disclaimer copy from legal counsel (open question #4).
- ML-based sanitiser layer for evasion (open question A5).
