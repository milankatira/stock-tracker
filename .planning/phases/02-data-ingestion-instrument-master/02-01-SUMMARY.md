---
phase: 02-data-ingestion-instrument-master
plan: 01
slug: ports-stock-adapters-test-infra
date: 2026-05-28
status: complete
deviations:
  - "Adapted to Vitest (repo standard) instead of Jest. mongodb-memory-server + ioredis-mock + Google OAuth mock infra was already landed in Wave-0; new SDK adapters use vi.mock instead of nock."
  - "Adapters live inside the existing apps/api/src/modules/market-data/ module rather than a new apps/api/src/data-ingestion/ tree. The legacy YahooFinanceProvider (Phase 1 HTTP-only quote path) is retained — the new YahooAdapter implements the full PriceProvider port (quote + history + fundamentals). MarketDataModule now exposes both."
  - "Used NestJS built-in Logger (already standard in the repo) instead of nestjs-pino — keeps the dependency surface smaller. Structured-context logging contract preserved via Logger.error(context, message)."
  - "Added pnpm override `\"@types/express\": \"^5.0.6\"` at the workspace root because stock-nse-india → apollo-server-express transitively pinned @types/express@4, which clashed with the API's csrf-csrf typing in main.ts:76."
---

## What landed

### Provider ports + DTOs (`packages/shared/`)

- `src/providers/provider-result.ts` — discriminated `ProviderResult<T>` envelope (`ok | stale | err`) with seven enumerated err reasons.
- `src/providers/price-provider.port.ts` — `Quote`, `OHLCVBar` (always-adjusted `close` + `rawClose` audit field), `QuoteSummaryModule`, `Fundamentals`, `PriceProvider` interface, `PRICE_PROVIDER` token.
- `src/providers/fund-provider.port.ts` — `NavSnapshot`, `NavPoint`, `SchemeMaster`, `FundProvider`, `FUND_PROVIDER`.
- `src/providers/news-provider.port.ts` — `NewsItem`, `NewsProvider`, `NEWS_PROVIDER`.
- `src/providers/tokens.ts` — token barrel + the new `CORPORATE_ACTIONS_PROVIDER` symbol.
- `src/providers/index.ts`, `src/instruments/index.ts` — barrels.
- `src/instruments/instrument.dto.ts` — `InstrumentDto` with cross-phase `popularity` (Phase 5 search ranking) + `dataVersionHash` (Phase 4 cache key seed).
- `src/instruments/fund.dto.ts` — `FundDto` mirror.
- `src/index.ts` — re-exports both barrels.

### ESLint architecture fence (`eslint.config.mjs`)

Added a `no-restricted-imports` flat-config block scoped to `apps/api/src/**/*.ts` with `apps/api/src/modules/market-data/**` and test files in `ignores`. Blocks:

- `yahoo-finance2`, `yahoo-finance2/*` (PriceProvider port required)
- `stock-nse-india`, `stock-nse-india/*` (PriceProvider / CORPORATE_ACTIONS_PROVIDER required)
- `rss-parser`, `rss-parser/*` (NewsProvider port required)

New pnpm script: `apps/api/package.json` → `"lint:arch": "eslint 'src/**/*.ts'"`.

### Yahoo adapter (`apps/api/src/modules/market-data/`)

- `yahoo.schemas.ts` — Zod 4 boundary schemas for `quote`, `historical[]`, `quoteSummary` (raw-field extraction transform).
- `yahoo.adapter.ts` — `YahooAdapter implements PriceProvider`. `getLatestQuote` / `getDailyHistory` / `getFundamentals`. Pipeline: `Bottleneck({ maxConcurrent: 4, minTime: 250 })` → `pRetry({ retries: 2, factor: 2, randomize: true })` → `pTimeout(6_000ms)`. `parse()` (not `safeParse`) at every boundary; `ZodError` → typed `validation` err; other errors rethrown so the Plan 02-03 circuit breaker can count them.
- `yahoo.adapter.spec.ts` — 7 behaviour cases (ok quote, missing-price validation err, rethrow on non-validation, adjusted-close + rawClose preservation across a synthetic split bar, malformed-history validation err, flattened fundamentals + raw bag, malformed-summary validation err). Backed by `apps/api/test/fixtures/yahoo-quote.json` + `yahoo-history.json` (10 bars incl. one ratio-5 split day).

### NSE supplement adapter (`apps/api/src/modules/market-data/`)

- `nse.schemas.ts` — boundary schema for `EquityDetails` + `EquityCorporateInfo`. Pure helpers `parseCorporateActionType(purpose)`, `extractSplitRatio(purpose)`, `extractDividendValue(purpose)`. Strings classified: SPLIT / BONUS / DIVIDEND / UNKNOWN.
- `nse.adapter.ts` — `NseAdapter implements PriceProvider`. `getLatestQuote` returns ok envelope; `getDailyHistory` + `getFundamentals` return `not-found` per RESEARCH Pitfall 5 (NSE history is unreliable). `getCorporateActions(yahooSymbol, from, to)` returns date-filtered, newest-first list of `CorporateAction[]`. Constructor accepts `@Optional() client?` for test stubbing without DI noise. `Bottleneck({ maxConcurrent: 2, minTime: 500 })` + `pTimeout(10_000ms)`.
- `nse.adapter.spec.ts` — 8 NSE adapter tests + 6 classifier samples + 2 ratio/dividend extractor cases. Backed by `apps/api/test/fixtures/nse-quote.json` + `nse-corporate-actions.json` (4 events: SPLIT, BONUS, DIVIDEND, DIVIDEND).

### Module wiring (`apps/api/src/modules/market-data/market-data.module.ts`)

- Registers both `YahooAdapter` and `NseAdapter` as Nest providers.
- Binds `PRICE_PROVIDER` token (from `@finsight/shared`) → `YahooAdapter` via `useExisting`. Plan 02-03 will replace this with the chain wrapper.
- Binds `CORPORATE_ACTIONS_PROVIDER` token → `NseAdapter` via `useExisting` — keeps NSE off the price hot path while making its corporate-actions feed available to the Plan 02-03 adjustment service.
- Legacy `MARKET_DATA_PROVIDER` → `YahooFinanceProvider` binding is preserved so the existing analysis flow continues to work unchanged.

## Pinned runtime versions (`apps/api/package.json`)

- `yahoo-finance2`: ^3.14.2
- `stock-nse-india`: ^1.4.0
- `opossum`: ^9.0.0 (matches Plan 02-03 chain requirement — NOT 8.x)
- `p-retry`: ^8.0.0
- `p-timeout`: ^7.0.1
- `bottleneck`: ^2.19.5
- `zod`: ^4.4.3 (unchanged; matches Plan 02-03 v4 requirement)

## Workspace overrides (`package.json`)

```json
"pnpm": {
  "overrides": {
    "@types/express": "^5.0.6"
  }
}
```

Forces a single Express v5 type tree across the workspace; without it `apollo-server-express@3.13.0` (transitive via stock-nse-india) pulls in `@types/express@4.17.14` and the api `tsc --noEmit` fails at `main.ts:76` on `getHttpAdapter().get()` typing.

## Verification

| Gate | Result |
|------|--------|
| `pnpm --filter @finsight/api test` | 160 pass (37 files) |
| `pnpm --filter @finsight/api test:e2e` | 16 pass (4 files) |
| `pnpm --filter @finsight/api type-check` | clean |
| `pnpm --filter @finsight/api lint` | clean |
| `pnpm --filter @finsight/api lint:arch` | clean |
| `pnpm --filter @finsight/web test` | 15 pass |
| `pnpm --filter @finsight/web type-check` | clean |
| `pnpm --filter @finsight/web lint` | clean |
| `pnpm forbid-verbs` | clean |
| `git diff --check` | clean |
| SDK fence: `yahoo-finance2`/`stock-nse-india` imported outside `apps/api/src/modules/market-data/` | none |
| `safeParse(` in new adapters | none (only mentioned in a comment) |

## Import paths Plan 02-02 and Plan 02-03 will use

```ts
import {
  PRICE_PROVIDER,
  CORPORATE_ACTIONS_PROVIDER,
  FUND_PROVIDER,
  NEWS_PROVIDER,
  type PriceProvider,
  type FundProvider,
  type NewsProvider,
  type ProviderResult,
  type Quote,
  type OHLCVBar,
  type Fundamentals,
  type NavSnapshot,
  type NavPoint,
  type SchemeMaster,
  type NewsItem,
  type InstrumentDto,
  type FundDto,
} from "@finsight/shared";

import { YahooAdapter } from "../market-data/yahoo.adapter";
import { NseAdapter, type CorporateAction } from "../market-data/nse.adapter";
import {
  parseCorporateActionType,
  extractSplitRatio,
  extractDividendValue,
} from "../market-data/nse.schemas";
```

## Cross-phase contracts confirmed

- `InstrumentDto.popularity` + `FundDto.popularity` exist (Phase 5 search ranking depends on them).
- `InstrumentDto.dataVersionHash` + `FundDto.dataVersionHash` exist (Phase 4 cache key seed).
- `OHLCVBar.close` documented as ALWAYS the corporate-action-adjusted close; `OHLCVBar.rawClose` preserved for audit.
- `ProviderResult<T>` discriminated union ready for the Plan 02-03 fallback chain.

## What this plan does NOT yet do (deferred to Plan 02-02 / 02-03)

- MFAPI/AMFI fund adapters (Plan 02-02).
- RSS/NewsData news adapters (Plan 02-02).
- `Instrument` / `Fund` Mongo schemas + monthly seed job (Plan 02-03).
- MongoDB time-series `price_history` + `nav_history` (Plan 02-03).
- Corporate-action adjustment service + NSE holiday calendar (Plan 02-03).
- opossum 9 circuit breakers + stale-cache fallback chain (Plan 02-03) — the `PRICE_PROVIDER` binding will be swapped from `YahooAdapter` to the chain there.
- `TickerTaggerService` (Plan 02-03) — news → instrument tagging.
