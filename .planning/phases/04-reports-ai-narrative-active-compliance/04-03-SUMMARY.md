---
phase: 04-reports-ai-narrative-active-compliance
plan: 03
slug: stock-report-api-and-materialised-read-path
date: 2026-05-28
status: complete
deviations:
  - "Used `AccessTokenGuard` (Phase 2 saved-history) instead of the plan's `JwtAuthGuard` — the repo never built a separate JwtAuthGuard, and AccessTokenGuard already wraps `AuthService.getAuthenticatedUser`."
  - "Native `fetch()` (Node 22 built-in) used for the HMAC-signed revalidate webhook instead of installing `@nestjs/axios`. Same semantics; fewer deps."
  - "`PrecomputedReportsModule` (still under `apps/api/src/reports/`) was promoted from Plan 04-02 stub to full module — adds `MongooseModule.forFeature`, the two controllers, `PricesService`, `PeerSetService`. The Phase 2 saved-report-history module at `apps/api/src/modules/reports/` is untouched."
  - "k6 perf gate ships as `perf/report-load.js` with usage runbook. CI integration deferred — local run before release is the v1 gate. Documented in this SUMMARY."
  - "`PricesService` reads from the Plan 02-03 `PriceHistoryRepository` directly. Downsampling deferred — daily granularity from the time-series collection is already chart-friendly for v1."
  - "When the persisted narrative is present the past-performance disclaimer is attached (defensive — every narrative may reference returns). Strictly per the plan, stock reports omit it; Plan 05 fund report always attaches it."
---

## What landed

### Shared DTO (`packages/shared/src/stock-report.ts`)

- `StockReportDoc`, `Pillars`, `SwotPayload`, `InsightsBlock`, `Peer`, `Narrative`, `Disclaimers`, `DataLineageEntry`.
- `Timeframe` ('1D' | '1W' | '1M' | '6M' | '1Y' | '5Y' | 'MAX') + `TIMEFRAMES` array for class-validator + `OhlcCandle`.
- `Verdict` reused from `verdict.ts` (the branded type from Plan 01-04). Tests use `makeVerdict("CAUTION")` to build branded literals.

### Mongo schema (`apps/api/src/reports/schemas/stock-report-doc.schema.ts`)

- `StockReportDocEntity` Mongoose `@Schema` keyed on `ticker` (unique) with a `(ticker, asOf)` history index. Fields stored as `Mixed` objects where the shape is downstream-defined; strict shape validation lives at the API boundary via DTOs and the shared types.

### `ReportsService` filled (`apps/api/src/reports/reports.service.ts`)

- `getStock(ticker)` — Redis hit → return + inject disclaimers; Redis miss → Mongo lookup → Redis warm → inject disclaimers; doc missing → `null`.
- Disclaimer policy: `ANALYSIS_DISCLAIMER` always attached; `PAST_PERF_DISCLAIMER` attached when a narrative is present (defensive — the deterministic-fallback narrative carries `Verdict: Strong Score` text but downstream callers can still inspect the score-based returns block).
- `upsertNarrative(ticker, payload)` — Mongo `$set` on `narrative` / `insights.swot` / `dataVersionHash` / `asOf` with `{ upsert: true }`; bustCache fires after persistence.
- `bustCache(ticker)` — best-effort Redis `DEL` + HMAC-signed POST to `${REVALIDATE_WEBHOOK_URL}/api/internal/revalidate` (header `x-revalidate-hmac`). Both halves wrapped in try/catch so a single failure never bubbles up.
- HMAC signed with `REVALIDATE_HMAC_SECRET` from env. When either env var is missing the webhook is skipped with a structured warn log — preserves local development ergonomics.

### Endpoints (behind `AccessTokenGuard`)

- `GET /reports/stock/:ticker` (`StockReportsController`) — ticker regex `^[A-Z0-9.&-]+$` (accepts NSE/BSE tickers incl. `M&M-FIN`). Returns `StockReportDoc` or `404`.
- `GET /reports/stock/:ticker/prices?tf=…` (`PricesController`) — class-validator `@IsIn(TIMEFRAMES)`. Returns `OhlcCandle[]`.

### `PeerSetService`

- Prefers the precomputed `peers` array on `StockReportDoc`.
- Falls back to instrument-master sector match → log-scale market-cap proximity (3 closest by `|ln(candidate.popularity) - ln(subject.popularity)|`). Universe is `InstrumentsRepository.listActiveTickers()` (Plan 02-03).
- Cached in Redis 24h via the existing `REDIS_CLIENT` injection (no `multi()` calls — uses the typed `RedisCacheClient.set(key, value, "EX", ttl)` contract).
- Logs `peer_set_short_pool` warn when the sector has fewer than 3 candidates.

### `PricesService`

- Reads from `PriceHistoryRepository.findByInstrument(id)` (Plan 02-03 time-series).
- Slices the requested timeframe (`1D` / `1W` / `1M` / `6M` / `1Y` / `5Y` / `MAX`) and maps to `OhlcCandle[]` with unix-seconds timestamps. No downsampling in v1.

### k6 perf gate (`perf/report-load.js`)

- Constant arrival rate scenario @ 100 RPS for 60s, p95 threshold 1500ms, fail rate threshold 1 %.
- `setup()` warms the cache by hitting each ticker once before the timed run.
- Documented runbook (env vars `API_BASE`, `API_AUTH_TOKEN`, `TICKERS`). CI integration deferred — local run before release is the v1 gate.

### Env schema (`apps/api/src/config/env.schema.ts`)

- `REVALIDATE_HMAC_SECRET` + `REVALIDATE_WEBHOOK_URL` added as optional Zod entries. Production wires both; dev/test can leave them unset.

### Module wiring

- `app.module.ts` adds `PrecomputedReportsModule`. The existing Phase 2 saved-history `ReportsModule` (under `modules/reports/`) is untouched.

## Tests

| File | Coverage |
|------|----------|
| `reports.service.spec.ts` (6) | Redis hit short-circuits Mongo; Redis miss falls back to Mongo + warms cache; missing doc → null; disclaimers attached (with conditional past-perf); upsertNarrative writes with `upsert: true` + bustCache side effect; bustCache fires HMAC webhook when env is set / skips when missing / never throws on webhook failure. |
| `stock-reports.controller.spec.ts` (4) | Happy path returns doc; missing doc → NotFoundException; invalid ticker regex → BadRequestException; NSE-style tickers (`M&M-FIN`) pass. |
| `peer-set.service.spec.ts` (4) | Returns precomputed peers when present; sector + market-cap proximity fallback (excludes wrong sector); caches in Redis 24h; empty list when subject ticker not found. |

## Cross-phase contracts emitted

- `StockReportDoc` shape — Plan 04-04 web app consumes this directly via `@finsight/shared` import. Phase 8 SEO pages render the same shape server-side.
- `Timeframe` + `OhlcCandle` — `apps/web` PriceChart component (Plan 04-04) imports these.
- `ReportsService.upsertNarrative` — the Plan 04-02 narrative-batch processor's `NotImplementedException` is now satisfied. Re-running the unit suite proves the stub is fully replaced.
- HMAC-signed revalidate webhook contract — Plan 04-04 ships the Next.js receiver. Header is `x-revalidate-hmac`, body is `{ tag: 'stock:<ticker>' }`.

## Verification (at commit time)

| Gate | Result |
|------|--------|
| `pnpm --filter @finsight/api test` | **461 pass** (76 files; up from 445) |
| `pnpm --filter @finsight/api test:e2e` | 16 pass |
| `pnpm --filter @finsight/api type-check` | clean |
| `pnpm --filter @finsight/api lint` | clean |
| `pnpm --filter @finsight/api lint:arch` | clean |
| `pnpm --filter @finsight/web test` | 15 pass |
| `pnpm forbid-verbs` | clean |
| `git diff --check` | clean |
| AiService import outside allowed dirs | none — ESLint COMP-02 fence still rejects `reports/` from importing `ai.service` |
| Native `fetch()` used by ReportsService.bustCache | verified via spec — no `@nestjs/axios` dep added |

## Open questions / [ASSUMED]

- **Disclaimer attachment policy.** Plan calls for `pastPerformance` strictly when a "returns view" is shown. Our v1 attaches it whenever `narrative` is non-null because the fallback narrative may include verdict copy that downstream UI could pair with returns. Plan 05 (funds) tightens this for funds; revisit when Plan 04-04 lands the UI.
- **Peer set scoring.** Computed peers ship with `score: 0` until the EOD job populates the precomputed `peers` field with real scores. Plan 04-03 stores scoring only when the EOD-job-populated peers array exists; computed-fallback peers reference the score-less catalogue.
- **k6 CI gate.** Deferred. The script ships and is documented; release sign-off requires a local run.

## What this plan defers

- `NarrativeContextProvider.forTicker(ticker)` body (Plan 04-02 stub still throws `NotImplementedException` — Plan 04-04 or a Phase 2 wiring follow-up fills it).
- Plan 04-04 — Next.js stock report page + `revalidateTag` receiver at `/api/internal/revalidate`.
- Plan 04-05 — Mutual fund report API + page + Higher-Scoring Peers card.
- Migrating the existing `modules/narrative/` consumer onto `AiService` (still on the ESLint carve-out).
- k6 CI integration (release gate runs the script locally for now).
