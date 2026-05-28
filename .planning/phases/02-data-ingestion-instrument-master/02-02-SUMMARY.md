---
phase: 02-data-ingestion-instrument-master
plan: 02
slug: mf-news-adapters
date: 2026-05-28
status: complete
deviations:
  - "Adapted to Vitest (repo standard) instead of Jest. SDK and HTTP-client mocking uses vi.mock + injected fakes instead of nock; no real HTTP is touched in any spec."
  - "Adapters live in apps/api/src/modules/market-data/ (extending the existing module) rather than a new apps/api/src/data-ingestion/ tree — consistent with the Plan 02-01 adaptation."
  - "Used NestJS built-in Logger instead of nestjs-pino — the existing logger stack already produces structured context records via Logger.error(context, message)."
  - "Both axios HTTP clients are injected through @Optional() constructor params so specs can stub a thin client interface without DI noise. Same pattern used for the rss-parser fetcher and the NSE client in Plan 02-01."
  - "Pino-redact paths were not added (no pino in the project). The same goal — never log the NewsData.io key — is met via the redactApiKey helper applied to logged URLs before they are passed to Logger.error."
---

## What landed

### Adapters (apps/api/src/modules/market-data/)

- `mfapi.schemas.ts` + `mfapi.adapter.ts` + `mfapi.adapter.spec.ts` — MFAPI.in primary fund provider.
- `amfi.schemas.ts` + `amfi.parser.ts` + `amfi.parser.spec.ts` + `amfi.adapter.ts` + `amfi.adapter.spec.ts` — AMFI NAVAll.txt fallback fund provider with a pure parser.
- `rss-news.schemas.ts` + `rss-news.adapter.ts` + `rss-news.adapter.spec.ts` — MoneyControl + ET RSS news provider with LRU dedup.
- `newsdata-io.schemas.ts` + `newsdata-io.adapter.ts` + `newsdata-io.adapter.spec.ts` — supplemental News provider with graceful no-op when the API key is absent.

### Fixtures (apps/api/test/fixtures/)

- `mfapi-latest.json`, `mfapi-history.json`, `mfapi-schemes.json` — realistic MFAPI shapes (5 large-cap schemes covering ISIN-Reinvestment `null`).
- `amfi-navall-sample.txt` — 9 well-formed rows across 5 AMC groupings (incl. one row with `-` for ISIN reinvestment) plus one deliberately malformed row to exercise the `rejected` counter.
- `rss-moneycontrol-sample.json` — 3 normalized RSS items.
- `newsdata-io-sample.json` — 3 NewsData results with one `description: null` to exercise the optional mapping.

### MFAPI adapter contract (`MfapiAdapter implements FundProvider`)

- `getLatestNav(schemeCode)` — `GET /mf/{code}/latest` → ProviderResult<NavSnapshot>; date parsed from `DD-MM-YYYY` IST.
- `getNavHistory(schemeCode)` — `GET /mf/{code}` → ProviderResult<NavPoint[]> sorted ascending by `ts`.
- `listSchemes()` — `GET /mf` → ProviderResult<SchemeMaster[]> with `'-'`/`''` normalized to `null` ISINs.
- Resilience: `Bottleneck(maxConcurrent: 5, minTime: 200ms)` → `pTimeout(6_000ms)`. Zod 4 `.parse()` at the boundary; ZodError → typed `validation` err.
- Axios error mapping: 404 → `not-found`, 429 → `rate-limited`, ≥500 → `upstream-5xx`, `ECONNABORTED` → `timeout`; anything else is rethrown so the Plan 02-03 circuit breaker can count it.

### AMFI adapter contract (`AmfiAdapter implements FundProvider`)

- `listSchemes()` — downloads NAVAll.txt (30s timeout) → `parseAmfiNavAll(body)` → integrity gate `rows.length >= 8_000` → ProviderResult<SchemeMaster[]>.
- `getLatestNav(schemeCode)` — re-parse + filter (Plan 02-03 nightly job will pre-populate Mongo so this becomes cold-path).
- `getNavHistory()` — returns typed `not-found` because NAVAll is a snapshot with no history.
- Integrity gate: when the row count falls below 8 000, returns `upstream-5xx` (so the chain can fall through and retry later) and logs structured `amfi_unexpected_low_row_count`.

### `parseAmfiNavAll(body)` — pure function contract

```ts
export interface ParseAmfiResult {
  readonly rows: readonly AmfiNavRow[];
  readonly rejected: number;
}
export function parseAmfiNavAll(body: string): ParseAmfiResult;
```

- Pure: zero I/O, deterministic, never throws. Calling twice on the same input yields equal outputs (verified by spec).
- Per-row `safeParse` is the **deliberate exception** to the "always `.parse()`" rule (documented inline + in the SUMMARY): partial corruption in a 25 k-row daily snapshot must never drop the whole file. Counts rejects so the adapter can log them, and the adapter-level row-count gate catches catastrophic truncation.
- ISIN placeholders (`'-'`, `''`, `'N.A.'`) are normalized to `null`.

### RSS news adapter (`RssNewsAdapter implements NewsProvider`)

- Configured feeds: `moneycontrol-markets`, `moneycontrol-business`, `economictimes-markets`.
- Pipeline per feed: `Bottleneck(maxConcurrent: 2, minTime: 1_000ms)` → `pTimeout(5_000ms)` → rss-parser `parseURL`.
- LRU dedup (`max: 5_000`, `ttl: 7 days`) keyed by RSS `<guid>` or `<link>` fallback. Repeat calls with overlapping items yield only the new ones.
- `since` filter: only items with `publishedAt > since` are returned.
- **Per-feed try/catch**: a bad feed (timeout, network error, malformed XML) is logged with `rss_feed_failed` and skipped — the batch never aborts.
- Pure-data invariant: adapter is a dumb fetcher; tagging items to instruments lives in the Plan 02-03 `TickerTaggerService`.

### NewsData.io adapter (`NewsDataIoAdapter implements NewsProvider`)

- Reads `NEWSDATA_IO_API_KEY` via `ConfigService`. When missing/empty, the adapter **does not make a network call** and returns `{ status: 'err', reason: 'rate-limited', message: 'NEWSDATA_IO_API_KEY not configured', source: 'newsdata.io' }`. This is verified by an explicit assertion in the spec (`expect(client.get).not.toHaveBeenCalled()`).
- Endpoint: `GET https://newsdata.io/api/1/news?apikey=…&q=business+india&country=in`.
- Pipeline: `Bottleneck(maxConcurrent: 1, minTime: 500ms)` → `pTimeout(6_000ms)`.
- `redactApiKey(url)` strips `apikey=…` from any URL string before structured logging (exported from `newsdata-io.schemas.ts` and unit-tested).
- Axios error mapping: 429 → `rate-limited`, ≥500 → `upstream-5xx`, `ECONNABORTED` → `timeout`.

## Module wiring (`apps/api/src/modules/market-data/market-data.module.ts`)

```ts
providers: [
  MarketDataService,
  YahooAdapter, NseAdapter,
  MfapiAdapter, AmfiAdapter,
  RssNewsAdapter, NewsDataIoAdapter,
  { provide: MARKET_DATA_PROVIDER,        useClass:    YahooFinanceProvider },
  { provide: PRICE_PROVIDER,              useExisting: YahooAdapter },
  { provide: CORPORATE_ACTIONS_PROVIDER,  useExisting: NseAdapter },
  { provide: FUND_PROVIDER,               useExisting: MfapiAdapter },
  { provide: NEWS_PROVIDER,               useExisting: RssNewsAdapter },
],
exports: [
  MarketDataService,
  YahooAdapter, NseAdapter, MfapiAdapter, AmfiAdapter,
  RssNewsAdapter, NewsDataIoAdapter,
  PRICE_PROVIDER, CORPORATE_ACTIONS_PROVIDER,
  FUND_PROVIDER, NEWS_PROVIDER,
],
```

`FUND_PROVIDER` and `NEWS_PROVIDER` will be replaced by the Plan 02-03 chain wrapper; both fallback adapters (`AmfiAdapter`, `NewsDataIoAdapter`) are already registered and exported so the chain can compose them without further module surgery.

## Env contract (`NEWSDATA_IO_API_KEY`)

- Added to `apps/api/src/config/env.schema.ts` as `z.string().min(1).optional()` — boot does not fail when it's missing.
- Mirrored in `.env.example` (with empty default + explanatory comment) and `apps/api/.env.test` (intentionally unset so the test path exercises the graceful-no-op branch).

## Pinned runtime versions (`apps/api/package.json`)

- `axios`: ^1.16.1
- `rss-parser`: ^3.13.0
- `lru-cache`: ^11.0.0
- `luxon`: ^3.7.2
- `@types/luxon`: dev dep

## Verification

| Gate | Result |
|------|--------|
| `pnpm --filter @finsight/api test` | 190 pass (42 files) |
| `pnpm --filter @finsight/api test:e2e` | 16 pass (4 files) |
| `pnpm --filter @finsight/api type-check` | clean |
| `pnpm --filter @finsight/api lint` | clean |
| `pnpm --filter @finsight/api lint:arch` | clean |
| `pnpm --filter @finsight/web test` | 15 pass |
| `pnpm --filter @finsight/web type-check` | clean |
| `pnpm forbid-verbs` | clean |
| `git diff --check` | clean |
| SDK fence: `yahoo-finance2`/`stock-nse-india`/`rss-parser` imported outside `apps/api/src/modules/market-data/` | none |
| `safeParse(` in adapter files | only `amfi.parser.ts` (deliberate per-row) and the pre-existing Phase 1 `yahoo-finance.provider.ts`; new adapters use `parse()` only |

## Threat-model touchpoints covered

- T-02-02-01 — MFAPI shape drift: Zod 4 `.parse()` at the boundary; ZodError → typed validation err; payload never persisted.
- T-02-02-02 — AMFI truncation: `rows.length < 8_000` → `upstream-5xx` err; nightly job will retry.
- T-02-02-03 — NEWSDATA_IO_API_KEY leak in logs: `redactApiKey()` strips `apikey=…` from any URL before `Logger.error`.
- T-02-02-04 — NEWSDATA_IO_API_KEY hardcoded: read via `ConfigService.get('NEWSDATA_IO_API_KEY')`; only declared once in `env.schema.ts`; grep audit confirmed no inline secret.
- T-02-02-05 — One flapping RSS feed crashing the batch: per-feed try/catch returns `[]` for the bad feed.
- T-02-02-06 — Free-tier exhaustion: `Bottleneck(1 / 500ms)` + typed `rate-limited` err on 429 → Plan 02-03 chain falls back to RSS.

## What this plan does NOT yet do (deferred to Plan 02-03)

- `Instrument` + `Fund` Mongo schemas with monthly seed job + cross-phase `popularity` field wiring.
- MongoDB time-series `price_history` + `nav_history` collections.
- Corporate-action adjustment service that cross-checks Yahoo `adjClose` against the NSE corporate-actions feed exposed by `NseAdapter.getCorporateActions`.
- `opossum 9` circuit breakers + stale-cache fallback chain — `PRICE_PROVIDER` / `FUND_PROVIDER` / `NEWS_PROVIDER` bindings will be swapped from the primary adapter to the chain wrapper there.
- `TickerTaggerService` (Plan 02-03) — news → instrument tagging.
- NSE holiday calendar (2026 + 2027 incl. Muhurat session).
