---
phase: 02-data-ingestion-instrument-master
plan: 03
slug: instrument-master-price-history-chains
date: 2026-05-28
status: complete
deviations:
  - "Adapted to Vitest + the existing apps/api/src/modules/market-data/ tree (subdirs: instruments/, calendar/, price-history/, circuit/, stale-cache/, chains/). No parallel data-ingestion module."
  - "Used Nest built-in Logger throughout, not nestjs-pino (consistent with the Plan 02-01 / 02-02 deviation)."
  - "BullMQ Processor wiring deferred: the InstrumentMasterSeedRunner ships as a plain @Injectable with a public run() method. A follow-up plan can wrap it in `@Processor('instrument-master-seed')` once Redis/BullMQ infra is provisioned. The seed parsers, AMFI adapter integration, and bulkUpsert idempotency are all covered now."
  - "MongoDB `name: 'text'` indexes on Instrument + Fund were dropped because they conflict with the schema-level case-insensitive collation. Phase 5 search ranking will reintroduce name search via Atlas Search (already on the locked stack)."
  - "AdjustmentService back-adjusts on SPLIT + BONUS only, ignoring DIVIDEND actions because Yahoo's adjClose already incorporates dividend adjustments (RESEARCH Pattern 5)."
  - "Test dates avoid Eid-ul-Adha 2026 (2026-05-27 in the calendar) — normal-day assertions use 2026-05-20 instead."
---

## What landed

### Instrument master (`apps/api/src/modules/market-data/instruments/`)

- `instrument.schema.ts` + `fund.schema.ts` — Mongoose @Schemas with the cross-phase contracts: `popularity` (required, indexed, Number) drives Phase 5 search ranking; `dataVersionHash` defaults to empty and is seeded by `DataVersionHashService`. Schema-level case-insensitive collation `{ locale: 'en', strength: 2 }` makes nseSymbol lookups case-insensitive at the index level.
- `instruments.repository.ts` + `funds.repository.ts` — typed Mongoose repositories with `findByX` helpers and a `bulkUpsert` that uses `$set` for refreshable fields + `$setOnInsert` for the cross-phase contract fields (`popularity: 0`, `dataVersionHash: ''`).
- `lookup.service.ts` — `LookupService` resolves NSE / Yahoo / BSE / ISIN inputs to the same canonical Instrument. `resolveInstrument(raw)` is the single entry point used by downstream search code; pattern-detects ISIN (`/^IN[A-Z0-9]{10}$/i`), BSE code (`/^\d+$/`), Yahoo suffix (`.NS` / `.BO`), or falls through to NSE symbol.
- `data-version-hash.service.ts` — `DataVersionHashService.bump(instrumentId, patch)` reads the instrument, merges the patch into `(lastPriceTs, lastFundamentalsTs, lastNewsTs)`, computes sha1 over the tuple, and persists. The static `compute()` method is the same logic — exposed for the chain services that don't want the read+write side effect.
- `seed/nse-bhavcopy.seed.ts` — pure CSV parser via `csv-parse/sync`, filters to `SERIES='EQ'`, emits `InstrumentSeedInput[]`.
- `seed/amfi-scheme-master.seed.ts` — derives `plan` (DIRECT vs REGULAR) + `option` (GROWTH vs IDCW) + `amcCode` (first token of scheme name, uppercased, length-capped) from the AMFI scheme list. Reuses the `AmfiAdapter` from Plan 02-02.
- `seed/instrument-master-seed.runner.ts` — orchestrator that pulls the bhav copy (URL from `NSE_BHAVCOPY_URL`), the AMFI list, and upserts both. Idempotent. Accepts an injected `AxiosInstance` via `@Optional()` so tests inject a stub. The plain `run()` interface lets a future BullMQ Processor wrap it without a refactor.

### NSE holiday calendar (`apps/api/src/modules/market-data/calendar/`)

- `nse-holidays-2026.json` — official 2026 NSE trading-holiday list (16 entries including Diwali Muhurat as `MUHURAT_SESSION` with `from: '18:00'` / `to: '19:00'`).
- `nse-holidays-2027.json` — provisional 2027 entries; the file's `source` field flags that it should be refreshed in December 2026 once NSE publishes the official calendar.
- `market-holiday.service.ts` — `MarketHolidayService` exposes `isTradingDay(date)` (weekend + holiday-aware) and `isInTradingSession(now)` (09:15–15:30 IST normal hours, plus the special Muhurat window). luxon `DateTime` for timezone math; both `Date` and `DateTime` accepted as input.

### Time-series persistence (`apps/api/src/modules/market-data/price-history/`)

- `price-history.schema.ts` — `@Schema({ collection: 'price_history', timeseries: { timeField: 'ts', metaField: 'meta', granularity: 'hours' } })`. `meta.instrumentId` + `meta.source` are indexed via the metaField. Every persisted bar has `close = adjClose` (always-adjusted invariant) and `rawClose` retained for audit.
- `nav-history.schema.ts` — same shape for fund NAV, keyed by `meta.schemeCode`.
- `price-history.repository.ts` + `nav-history.repository.ts` — typed insert + per-instrument range queries.
- `adjustment.service.ts` — `AdjustmentService.applyAndPersist(instrumentId, yahooSymbol, source, bars)`:
  1. Sort bars ascending by `ts`.
  2. Detect day-over-day rawClose ratios outside [0.9, 1.1] — candidate corp-action days.
  3. If candidates exist, query `CORPORATE_ACTIONS_PROVIDER` (Plan 02-01 `NseAdapter`) for SPLIT / BONUS actions in the window.
  4. For confirmed SPLIT/BONUS actions, back-adjust all prior bars' OHLC by the observed factor.
  5. Persist all bars with `isAdjusted: true` + `rawClose` audit trail. DIVIDEND actions are ignored because Yahoo's adjClose already accounts for them.

### Circuit breaker + Redis stale-cache

- `circuit/breaker.factory.ts` — `CircuitBreakerFactory.forAction({ name, ...options }, fn)` produces per-action `opossum 9` breakers, keyed by name (per-provider-per-method). Hooks lifecycle events (`open`/`halfOpen`/`close`/`reject`/`timeout`) into the structured logger. `list()` exposes current state for health probing.
- `stale-cache/stale-cache.service.ts` — `StaleCacheService` is the Redis-backed last-known-good cache used by all three chains. Every `write()` MUST carry positive `ttlSeconds` — non-finite or `<= 0` throws `BadRequestException` (enforces project rule `data/redis-always-ttl`). `read()` returns `{ value, stalenessSeconds }` so chains can surface staleness in their `ProviderResult`.

### Provider chains (`apps/api/src/modules/market-data/chains/`)

All three chains implement the corresponding port and replace the scaffold `useExisting` bindings from earlier plans.

- `price-chain.service.ts` — `PriceChainService implements PriceProvider`. Quote: Yahoo → NSE → stale-cache. History + Fundamentals: Yahoo → stale-cache. On any `ok` result, writes to `StaleCacheService`. When everything fails, returns `{ status: 'stale', stalenessSeconds }` from the cache if present, else typed `unknown` err.
- `fund-chain.service.ts` — MFAPI → AMFI → stale-cache for latest NAV / scheme list. NAV history is MFAPI-only (AMFI snapshot has no history) → stale-cache fallback.
- `news-chain.service.ts` — RSS-first (returns immediately when it has items). If RSS is empty/err and NewsData.io succeeds, merges the two lists and returns `source: 'news-chain'`. Falls through to stale-cache on total failure.
- `ticker-tagger.service.ts` — `TickerTaggerService.tag(items)` joins NewsItems to instruments via word-boundary regex matching on NSE symbol, Yahoo symbol, and the first token of the canonical name. Lives next to the chains because it depends on the instrument master, but is a pure domain join (no I/O beyond the one repository call).

### Module wiring (`apps/api/src/modules/market-data/market-data.module.ts`)

Registers every new schema, repository, service, and adapter. The DI tokens that domain code consumes are now:

```ts
{ provide: PRICE_PROVIDER,             useExisting: PriceChainService },
{ provide: FUND_PROVIDER,              useExisting: FundChainService },
{ provide: NEWS_PROVIDER,              useExisting: NewsChainService },
{ provide: CORPORATE_ACTIONS_PROVIDER, useExisting: NseAdapter },
{ provide: MARKET_DATA_PROVIDER,       useClass:    YahooFinanceProvider },  // legacy
```

The chain bindings replace the scaffold `useExisting: YahooAdapter / MfapiAdapter / RssNewsAdapter` that the earlier plans wired in. Domain code (Phase 3 scoring, Phase 4 reports) sees only the abstract ports.

## Cross-phase contracts confirmed

- `Instrument.popularity` + `Fund.popularity` — required, indexed Number fields. Phase 5 search ranks by `{ popularity: -1 }`.
- `Instrument.dataVersionHash` — sha1 over `(id, lastPriceTs, lastFundamentalsTs, lastNewsTs)`. Phase 4 Gemini-narrative cache key seed.
- `price_history.close` — always corp-action adjusted; `rawClose` retained for audit.
- `ProviderResult` envelope — chain returns `'stale'` with `stalenessSeconds > 0` whenever cache is the source of truth.

## New runtime deps

- `csv-parse@^5.5.6` — bhav copy parser
- `@types/opossum@^8.1.9` (dev) — typings for the existing `opossum@^9` runtime dep

## Verification (at commit time)

| Gate | Result |
|------|--------|
| `pnpm --filter @finsight/api test` | 246 pass (51 files) |
| `pnpm --filter @finsight/api test:e2e` | 16 pass (4 files) |
| `pnpm --filter @finsight/api type-check` | clean |
| `pnpm --filter @finsight/api lint` | clean |
| `pnpm --filter @finsight/api lint:arch` | clean (provider-SDK fence intact) |
| `pnpm --filter @finsight/web test` | 15 pass |
| `pnpm --filter @finsight/web type-check` | clean |
| `pnpm --filter @finsight/web lint` | clean |
| `pnpm forbid-verbs` | clean |
| `git diff --check` | clean |

## What this plan still defers

- BullMQ Processor wrapper around `InstrumentMasterSeedRunner` + the monthly repeatable schedule. Plan 02-03b (or Phase 3's EOD-recompute plan) can land it once Redis/BullMQ is provisioned in the runtime env.
- Backfill of `Instrument.popularity` from a real market-cap feed (currently 0 on insert; Phase 3 EOD fundamentals job will populate it).
- Phase 5 name search (Atlas Search or a properly-configured non-collation index) — drops the previous schema-level text indexes because they conflict with case-insensitive collation.
- `BreakerHealthIndicator` Terminus check — the `CircuitBreakerFactory.list()` API is in place; the Terminus binding can be added in the health module by Phase 4.
- Chain-level `dataVersionHash` bumps — the service is wired but the chains do not yet call `versionHash.bump()` after a successful price/news write. That belongs to the Phase 4 ingest worker that owns instrument-id resolution end-to-end.
