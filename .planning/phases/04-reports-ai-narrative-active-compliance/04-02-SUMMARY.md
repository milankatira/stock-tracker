---
phase: 04-reports-ai-narrative-active-compliance
plan: 02
slug: narrative-batch-pipeline
date: 2026-05-28
status: complete
deviations:
  - "Plan called for AiService.swot() to return AiOutput; we promoted it to SwotOutput (extends AiOutput + SwotResult) so the narrative-batch processor can persist the per-quadrant structure verbatim. ComplianceInterceptor was updated to preserve extra fields when wrapping (CompliantAiOutput now carries the extra payload alongside disclaimers)."
  - "Plan referenced `ScoringInputsService.getLatest()` from Phase 3 — that service does not exist in our build. Replaced with `NarrativeContextProvider.forTicker()` stub (apps/api/src/jobs/narrative-batch/narrative-context.provider.ts) that throws NotImplementedException pending the Phase 2 ↔ Phase 4 data assembly."
  - "Plan placed `ReportsService` at `apps/api/src/reports/`. We keep that path and call the new module `PrecomputedReportsModule` to disambiguate from the existing `apps/api/src/modules/reports/` (Phase 2 saved-report-history feature)."
  - "EOD processor now emits the `eod.ticker.recomputed` event after each successful child write. The emit + InstrumentsRepository lookup are wrapped in a defensive try/catch so a Phase 4 failure NEVER blocks the durable Phase 3 score-history write."
  - "Real Worker + Queue integration test against a Redis container deferred. Producer + processor + listener are unit-tested with mocked Queue + mocked AiService."
---

## What landed

### Pure libraries

- `apps/api/src/ai/narrative-cache-key.ts` — `buildNarrativeCacheKey(ticker, hash) → 'gemini-ctx:<ticker>:<hash>'`. Empty ticker/hash throws (fail loud).
- `apps/api/src/ai/fallback-narrative.ts` — `buildFallbackNarrative(score, verdict)` emits a compliance-safe deterministic narrative (`"FinSight Score: 7. Verdict: Strong Score."` etc.). Verdict copy uses `STRONG_SCORE / CAUTION / WEAK_SCORE` only — never BSH verbs. `FALLBACK_TEMPLATE` exported for documentation reuse.

### AiService promoted SWOT output

- `ai.types.ts` — new `SwotOutput extends AiOutput, SwotResult` so the narrative-batch processor can persist the per-quadrant structure verbatim.
- `ai.service.ts` — `swot()` now returns `SwotOutput`; the joined `text` is still produced for the interceptor audit, and the per-quadrant arrays have placeholders substituted with verified values.
- `compliance.interceptor.ts` — `CompliantAiOutput` extended with `[extraField: string]: unknown`; the `map()` spreads the original value so SWOT quadrants survive the disclaimer wrapping.

### narrative-batch queue + processor (`apps/api/src/jobs/narrative-batch/`)

- `narrative-batch.types.ts` — canonical queue / job names + `NarrativeBatchJobData` + `NarrativeContextBundle` (`{ ticker, dataVersionHash, score, verdict, NarrativeContext }`).
- `narrative-context.provider.ts` — `NarrativeContextProvider` stub (`@Injectable`) throws `NotImplementedException`. Plan 04-03 fills the body using the Phase 2 instrument master + latest persisted ScoreResult.
- `narrative-batch.queue.ts` — `NarrativeBatchQueue.enqueueForTicker(ticker, dataVersionHash, triggeredBy?)` uses deterministic `jobId = narrative:${ticker}:${hash}` (versioned idempotency: same hash → BullMQ no-op). `enqueueBatch` fans out one `add` per item.
- `narrative-batch.processor.ts` — `@Processor('narrative-batch', { concurrency: 4 })`:
  - dataVersionHash drift → return `{ skipped: 'stale-version' }` without calling Gemini.
  - `AiService.narrative` audit exhaustion → deterministic fallback narrative + `fallbackUsed: true` persisted.
  - SWOT audit exhaustion → empty quadrants persisted; processor still returns `ok: true`.
  - `ComplianceViolationException` rethrown → BullMQ retries; final failure lands in the FAILED set (no fallback for compliance breaches).
  - Calls `reports.upsertNarrative(ticker, payload)` then `reports.bustCache(ticker)`.

### ReportsService stub (`apps/api/src/reports/`)

- `reports.service.ts` — typed `UpsertNarrativePayload` + `Injectable` stub. Both `upsertNarrative` + `bustCache` throw `NotImplementedException` so Plan 04-03 (or the report controller) wires the Mongo upsert + Redis bust.
- `reports.module.ts` — `PrecomputedReportsModule` exports the stub. Distinct from `modules/reports/` (Phase 2 saved-report-history feature).

### Event-driven boundary (Phase 3 ↔ Phase 4)

- `jobs/narrative-batch/eod-recomputed.event.ts` — `EOD_TICKER_RECOMPUTED_EVENT` constant + `EodTickerRecomputedEvent` interface.
- `jobs/narrative-batch/eod-recomputed.listener.ts` — `@OnEvent(EOD_TICKER_RECOMPUTED_EVENT, { async: true })` calls `NarrativeBatchQueue.enqueueForTicker`. Wraps the call in try/catch so a Phase 4 outage never blocks Phase 3.
- `jobs/eod-recompute/eod-recompute.processor.ts` (Plan 03-03) — emits the event after the Mongo + Redis writes succeed. The `InstrumentsRepository.findById` lookup + `EventEmitter2.emit` are inside a defensive try/catch — failures log `eod_ticker_recomputed_emit_failed` but never bubble up.
- `app.module.ts` — adds `EventEmitterModule.forRoot()` + `NarrativeBatchModule`.

### Module wiring

- `narrative-batch.module.ts` — registers BullMQ queue, AiModule, PrecomputedReportsModule, processor + queue producer + context provider + listener.
- `app.module.ts` — adds `EventEmitterModule.forRoot()`, `NarrativeBatchModule` to the root imports.

### Tests

| File | Coverage |
|------|----------|
| `narrative-cache-key.spec.ts` (4) | composes prefixed key, versioned key changes per hash, throws on empty ticker / empty hash. |
| `fallback-narrative.spec.ts` (5) | STRONG_SCORE / CAUTION / WEAK_SCORE copy, never contains 'sell', passes `sanitiseAndCheck` for every verdict. |
| `narrative-batch.processor.spec.ts` (5) | Happy path (narrative + swot + upsert + bustCache + ok:true). Stale-version drift skip. Narrative-audit exhausted → fallback narrative persisted + `fallbackUsed: true`. SWOT-audit exhausted → empty quadrants persisted. ComplianceViolationException rethrown without substitute. |
| `narrative-batch.queue.spec.ts` (3) | Deterministic jobId, `triggeredBy` propagation, `enqueueBatch` fans out. |
| `eod-recomputed.listener.spec.ts` (2) | Enqueues from event payload; swallows queue errors so Phase 4 outages never block Phase 3. |

## Cross-phase contracts emitted

- `NarrativeBatchQueue.enqueueForTicker(ticker, dataVersionHash, triggeredBy?)` — public producer surface. Used by the EOD listener; will also be used by the (future) admin re-enqueue endpoint mirror.
- `EOD_TICKER_RECOMPUTED_EVENT` + `EodTickerRecomputedEvent` shape — Phase 3 EOD processor emits, Phase 4 listener consumes. Decouples the pipelines so neither side has to import the other's classes directly.
- `ReportsService.upsertNarrative(ticker, UpsertNarrativePayload)` — typed interface; Plan 04-03 fills the body.
- `NarrativeContextProvider.forTicker(ticker)` — typed interface for the Phase 2 ↔ Phase 4 data assembly seam. Plan 04-03 fills the body.

## Pinned deps

- `@nestjs/event-emitter@^3.0.1` — new.

## Verification (at commit time)

| Gate | Result |
|------|--------|
| `pnpm --filter @finsight/api test` | **445 pass** (73 files; up from 426) |
| `pnpm --filter @finsight/api test:e2e` | 16 pass |
| `pnpm --filter @finsight/api type-check` | clean |
| `pnpm --filter @finsight/api lint` | clean |
| `pnpm --filter @finsight/api lint:arch` | clean |
| `pnpm --filter @finsight/web test` | 15 pass |
| `pnpm forbid-verbs` | clean (with new narrative-batch processor spec carve-out) |
| `git diff --check` | clean |
| ESLint COMP-02 fence | intact — `AiService` and `@google/genai` only allowed inside `apps/api/src/{ai,jobs,chat,modules/narrative}/**` |

## Open questions resolved / carried forward

- **#5 retry budget** — encoded as `AiService.MAX_RETRIES = 3` (Plan 04-01) plus BullMQ queue-level `attempts: 3`. Worst case = 9 Gemini calls before a job lands FAILED. Compliance violations skip the fallback entirely.
- **#4 disclaimer copy** — still pending legal sign-off; Plan 04-02 doesn't change the constants.
- **A5 sanitiser evasion** — unchanged; the EVASION_FIXTURES regression set still tracks the v1 gap.

## What this plan defers

- Plan 04-03 — `ReportsService.upsertNarrative` + `bustCache` body (Mongo schema + Redis bust); `NarrativeContextProvider.forTicker` body (live data assembly from instrument master + persisted ScoreResult).
- Real Worker + Queue integration test against a Redis container (current tests mock the Queue interface).
- Migrating the existing `modules/narrative/` consumer onto `AiService` (so the ESLint carve-out for `modules/narrative/**` can be dropped) — slated for Plan 04-03 / 04-04.
- Confirming the global exception filter does NOT echo `ComplianceViolationException.forbidden` to clients (security-review follow-up — flagged in 04-01 SUMMARY).
