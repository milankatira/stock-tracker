---
phase: 04-reports-ai-narrative-active-compliance
plan: 05
slug: mutual-fund-report
date: 2026-05-28
status: complete
deviations:
  - "Used `AccessTokenGuard` (Phase 1 cookie-based) instead of the plan's `JwtAuthGuard` — same correction as Plan 04-03/04-04."
  - "Native `fetch()` in `FundReportsService.bustCache` (no `@nestjs/axios`) — mirrors Plan 04-03's choice."
  - "Phase 3 emits ONE event (`eod.ticker.recomputed`) with an `instrumentType: 'STOCK' \\| 'FUND'` discriminator (vs the plan's separate `eod.fund.recomputed`). Both listeners (`EodRecomputedListener`, new `FundEodRecomputedListener`) subscribe to the same topic and gate on `instrumentType` server-side. The existing stock listener was tightened to require `STOCK` so a FUND event never erroneously routes to the stock narrative-batch queue."
  - "Plan task 2 referenced a `ScoringInputsService.getLatestFund(scheme)` provider that does not exist in the repo. Mirrored the stock pattern instead: introduced `FundNarrativeContextProvider` as a `NotImplementedException` stub (parallel to `NarrativeContextProvider`). Real implementation lands with the Phase 3 MF EOD pipeline."
  - "`buildFallbackNarrative()` gained an additive optional `assetClass: 'stock' | 'fund'` param defaulting to `'stock'`. Stock fallback prefix stays `'FinSight Score'`; fund fallback emits `'FinSight Fund Score'`. Existing stock spec stays green."
  - "DTO compliance: the plan called for class-validator decorations on payload fields (e.g. `@ArrayMaxSize(10)` on holdings). The current API does not receive fund payloads on POST endpoints — Mongo is the write path via the narrative-batch processor — so the validators would never run. Shape integrity is enforced at the boundary by the shared `FundReportDoc` type. If a future POST endpoint accepts fund payloads, the decorators land in a follow-up."
  - "Fund report UI does not ship a `Tabs` primitive (no 'CAGR vs Cumulative' toggle in v1) — the buckets are already CAGR-equivalent percentages, and a toggle adds complexity without a v1 user need."
  - "`SectorAllocationCard` ships as horizontal bars instead of a pie chart (no extra dep). Visual parity is preserved; pie upgrade is a v1.1 polish pass."
  - "`HoldingsCard.test.tsx` counts header-row + data-rows together (`getAllByRole('row').length === 11`). Same shape but more idiomatic than a separate `getAllByRole('rowgroup')`."
---

## What landed

### Shared DTO (`packages/shared/src/fund-report.ts`)

- `FundReportDoc` + the building blocks the plan defined: `FundReturns`, `FundReturnsBucket`, `FundRisk`, `FundHolding`, `FundSectorWeight`, `FundMeta`, `FundPeer`, `HigherScoringPeer`, `FundPillars` (returns 35 / risk-adjusted 25 / consistency 15 / costs 10 / manager 10 / portfolio 5 per PROJECT.md). Re-exported from `@finsight/shared`.

### Mongo (`apps/api/src/reports/schemas/fund-report-doc.schema.ts`)

- `FundReportDocEntity` `@Schema({ collection: 'fundReports' })` keyed on `schemeCode` (unique + `(schemeCode, asOf)` history index). Mixed fields where downstream-defined; shape contract lives at the shared type.

### API service + controller

- `FundReportsService` (parallel to `ReportsService` from Plan 04-03):
  - `getFund(scheme)` Redis → Mongo → re-warm → `augment(doc)`.
  - `augment` ALWAYS attaches `ANALYSIS_DISCLAIMER` + `PAST_PERF_DISCLAIMER` (FUND-02 / COMP-03).
  - When `score.value < 6` it asks `FundPeerSetService.getHigherScoringPeers(scheme)`; if the result is non-empty it ships as the optional `higherScoringPeers` field on the response.
  - `upsertNarrative` writes `$set: { narrative, dataVersionHash, asOf }` with `{ upsert: true }`, then `bustCache`.
  - `bustCache` deletes Redis + fires HMAC POST `/api/internal/revalidate` with tag `fund:<schemeCode>` against `REVALIDATE_WEBHOOK_URL`. Webhook failures are logged-warn, never thrown.
- `FundPeerSetService`:
  - `getPeers(scheme)` — same-category candidates ranked by log-scale AUM proximity; top 3; Redis-cached 24h.
  - `getHigherScoringPeers(scheme)` — same-category candidates with strictly higher `score.value`; ordered desc; top 3; `scoreDelta` rounded to 2 decimals. Returns `[]` when subject score ≥ 6 (no DB call beyond the subject lookup).
- `FundReportsController` (`@UseGuards(AccessTokenGuard)`): `GET /reports/fund/:schemeCode` validates `^\d{1,7}$`. 200/400/404 wired.
- `PrecomputedReportsModule` now registers both `StockReportDoc` and `FundReportDoc` in `MongooseModule.forFeature`, exports the new service + peer-set.

### Fund narrative-batch (`apps/api/src/jobs/narrative-batch/`)

- `fund-narrative-batch.types.ts` — queue name + job name + `FundNarrativeContextBundle`.
- `fund-narrative-batch.queue.ts` — `enqueueForFund(scheme, dataVersionHash)` with deterministic `jobId = fund-narrative:<scheme>:<hash>` (versioned idempotency).
- `fund-narrative-context.provider.ts` — `NotImplementedException` stub. Real wiring deferred to Phase 3 MF EOD assembly.
- `fund-narrative-batch.processor.ts` — `@Processor(FUND_NARRATIVE_BATCH_QUEUE_NAME, { concurrency: 4 })`. Mirrors the stock pipeline (drift skip, AI happy path, `NarrativeAuditFailedError` → deterministic fallback, ComplianceViolation rethrow). Calls `buildFallbackNarrative(score, verdict, 'fund')` so the prefix reads `FinSight Fund Score`.
- `fund-eod-recomputed.listener.ts` — `@OnEvent('eod.ticker.recomputed')`. Gates on `instrumentType === 'FUND'`; enqueues via the fund queue. Best-effort try/catch — never blocks Phase 3.
- Existing `EodRecomputedListener` now gates on `instrumentType === 'STOCK'` so FUND events never route to the stock processor. All Plan 04-02 specs stay green.
- `NarrativeBatchModule` registers both queues + both listeners + both processors + both context providers.

### Fund report UI (`apps/web/src/app/_components/fund-reports/`)

- `FundScoreHeader` — reuses `ScoreGauge` + `VerdictBadge` from Plan 04-04 with scheme name + code + category subline.
- `ReturnsChart` (`'use client'`) — Lightweight Charts v5 with three `LineSeries` (fund / benchmark / category). One create on mount, three `setData` calls, resize-aware, removed on unmount. Legend below the timeframe row.
- `RiskStrip` — Sharpe (1Y), Std Dev (1Y), Max Drawdown (1Y). Drawdown rendered as negative percent with rose tone; each tile tooltip exposes the metric definition.
- `HoldingsCard` — sortable top-10 table (default: weightPct desc), `{val.toFixed(1)}%`, empty-state fallback.
- `SectorAllocationCard` — sorted horizontal bars; weight % capped at 100; empty-state fallback.
- `FundMetaStrip` — expense ratio %, AUM (₹X.XX{k|L} Cr), manager name, tenure (years).
- `FundPeerCard` — three rows, links to `/fund/<scheme>`, score-tone bands matching stock PeerCard.
- `HigherScoringPeersCard` (compliance-critical): card title is hardcoded to `Higher-scoring peers in the same category`. Subtitle uses neutral, informational copy. Spec `HigherScoringPeersCard.test.tsx` greps the rendered DOM for the seven advisory verbs (base64-held) — the test FAILS if any of them ever appear in the bundle. Returns `null` when peers are empty so no shell renders.

### Server-only fetch (`apps/web/src/app/_lib/reports/fetch-fund.ts`)

- `getFundReport(schemeCode)` mirrors `getStockReport` — forwards `access_token` cookie via the outgoing `Cookie` header, tags fetch with `fund:<scheme>` + 24h revalidate, 404 → null, 5xx → `FundReportFetchError`.

### Page (`apps/web/src/app/(app)/fund/[schemeCode]/page.tsx`)

- RSC with five Suspense boundaries (Score, ReturnsAndRisk, HoldingsAndAllocation, PeersAndNarrative, Disclaimer). `HigherScoringPeersCard` is conditionally rendered inside the Peers section when the payload includes the field. `loading.tsx` reuses `ReportPageSkeleton`.

## Tests added

| File | Coverage |
|------|----------|
| `fund-peer-set.service.spec.ts` (6) | top-3 by log-AUM proximity; Redis caching; subject-not-found; higher-scoring short-circuit when score ≥ 6; higher-scoring happy path with computed delta; higher-scoring subject-not-found. |
| `fund-reports.service.spec.ts` (9) | Redis hit short-circuits Mongo; past-perf disclaimer ALWAYS; Mongo fallback + cache warm; higherScoringPeers populated when score < 6; field absent when score ≥ 6; null doc → null; webhook fires fund-prefixed tag; webhook failure does not throw; upsertNarrative writes + busts cache. |
| `fund-reports.controller.spec.ts` (4) | happy path; NotFoundException; non-numeric → BadRequest; 8-digit → BadRequest. |
| `fund-narrative-batch.processor.spec.ts` (5) | stale-version drift skip; AI happy path persists via upsertNarrative; `NarrativeAuditFailedError` → `FinSight Fund Score` fallback (assetClass='fund'); ComplianceViolation rethrow; NotImplementedException from the seam stub propagates. |
| `fund-eod-recomputed.listener.spec.ts` (3) | FUND event enqueues with deterministic key; STOCK event ignored; enqueue failure is logged-not-thrown. |
| `ReturnsChart.test.tsx` (4) | legend renders Fund/Benchmark/Category; chart created once + 3 series; data pushed into each series; remove on unmount. |
| `RiskStrip.test.tsx` (3) | Sharpe + Std Dev + Max DD labels and values; max-DD negative percentage rendered in rose tone; metric definitions discoverable via tooltip. |
| `HoldingsCard.test.tsx` (3) | top-10 capped + sorted desc; one-decimal percent format; empty state. |
| `HigherScoringPeersCard.test.tsx` (4) | EXACT compliance title; one row per peer with link + score badge + scoreDelta; null render on empty list; forbidden-verb pattern absent from rendered DOM (base64 regex). |

## Cross-phase contracts emitted / consumed

- `FundReportDoc` shape — consumed by web `(app)/fund/[schemeCode]/page.tsx` and Phase 8 SEO pages.
- HMAC envelope `x-revalidate-hmac` + `REVALIDATE_HMAC_SECRET` — same secret + same Next.js receiver as Plan 04-04. Stock tag `stock:<ticker>` and fund tag `fund:<scheme>` route through the same handler.
- Event-driven boundary on `eod.ticker.recomputed` — Phase 3 emits with `instrumentType`; both listeners dispatch by type.
- `buildFallbackNarrative()` now supports `assetClass: 'fund'` — consumed by `FundNarrativeBatchProcessor`. Existing stock processor unchanged.

## Verification (at commit time)

| Gate | Result |
|------|--------|
| `pnpm --filter @finsight/api test` | **488 pass** (81 files; +27 net for 04-05) |
| `pnpm --filter @finsight/api test:e2e` | 16 pass |
| `pnpm --filter @finsight/api type-check` | clean |
| `pnpm --filter @finsight/api lint` | clean |
| `pnpm --filter @finsight/api lint:arch` | clean (COMP-02 fence still holds — `FundReportsService` does NOT import `AiService`) |
| `pnpm --filter @finsight/web test` | **78 pass** (17 files; +14 net for 04-05) |
| `pnpm --filter @finsight/web type-check` | clean |
| `pnpm --filter @finsight/web lint` | clean |
| `pnpm forbid-verbs` | clean (HigherScoringPeersCard test uses base64; source files contain no forbidden vocabulary) |
| `git diff --check` | clean |

## Open questions / [ASSUMED]

- **Open Question #2 (legal sign-off on user-facing peer-card title).** The plan's compliance lead approved "Higher-scoring peers in the same category" as the v1 copy; legal review still pending. The title is hardcoded; the spec greps for the forbidden-verb list. If legal returns a different phrasing, swap the literal + update the test allowlist in a single edit.
- **Phase 3 MF EOD pipeline.** This plan assumes Phase 3 emits `eod.ticker.recomputed` with `instrumentType: 'FUND'` for mutual-fund recomputes. Phase 3 currently only ships the stock leg; the fund leg lands with the AMFI NAV/NAVAll.txt ingestion. Until then, `FundEodRecomputedListener` is wired but never fires, and `FundNarrativeContextProvider.forFund()` keeps throwing `NotImplementedException`. Real fund narratives ship when Phase 3 + this provider both land.
- **DTO class-validator decorators.** Not added because the current API has no POST surface that accepts fund payloads. Shape integrity is enforced by `FundReportDoc` typing at every boundary. Re-evaluate when (if) an inbound write path lands.
- **Returns chart timeframe toggle.** Single CAGR view in v1. Cumulative-return view is a v1.1 add.
- **Sector allocation viz.** Bars in v1 (no chart-lib dep). Pie/donut is v1.1.

## What this plan defers

- Phase 3 MF EOD recompute that emits the `eod.ticker.recomputed` event with `instrumentType: 'FUND'`.
- Real `FundNarrativeContextProvider.forFund()` body (still a `NotImplementedException` seam).
- E2E (Playwright) smoke verifying the compliance-safe copy renders on real DOM (covered by unit test on the rendered output for v1).
- DTO class-validator decorators for any future inbound fund-payload write endpoints.
- Polish passes: CAGR-vs-Cumulative tabs, pie/donut sector allocation, copy refinement after legal review.

Phase 4 progress: **5/5 plans complete**. 04-01 (AiService chokepoint), 04-02 (narrative-batch + EOD listener), 04-03 (stock report API), 04-04 (stock report UI), 04-05 (MF report API + UI).
