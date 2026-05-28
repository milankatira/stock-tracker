# Phase 2: Data Ingestion & Instrument Master - Research

**Researched:** 2026-05-28
**Domain:** External market-data ingestion (Indian stocks + mutual funds) — provider adapters, fallback chain, schema validation, instrument master, adjusted price history
**Confidence:** HIGH on stack, adapter pattern, MongoDB time-series, and pitfalls (verified npm registry + official docs + project research). MEDIUM on Indian free-tier rate behavior (community sources, no SLA, must be empirically probed in Wave 0).

## Summary

This phase wires real free-tier Indian market data into the system behind a uniform `PriceProvider | FundProvider | NewsProvider` interface, with primary→secondary→tertiary→stale-cache fallback per metric, Zod schema validation on every external payload at ingestion, a canonical instrument master that resolves NSE/BSE/Yahoo symbol drift and AMFI scheme-code/plan/option drift, and always-adjusted price history stored in a MongoDB time-series collection keyed by an Indian-market holiday calendar. All of this is consumed downstream by Phase 3 (scoring) and Phase 4 (reports) via Mongo reads — domain code never touches an external SDK.

The non-negotiable invariants from Phase 0/1 carry through: every external response is validated before persistence (rejected on schema mismatch, not silently written), every Redis cache key carries a TTL, no client ever sees an "advice"-shaped string, and no live external API call appears on a user request path. Ingestion runs in BullMQ jobs; serving reads from Mongo + Redis.

**Primary recommendation:** Build a `DataIngestionModule` (NestJS) with three ports — `PriceProvider`, `FundProvider`, `NewsProvider` — each method returns a discriminated union `Ok<T> | Stale<T> | Err`. Wrap each adapter call in `opossum` (circuit breaker) + `p-retry` (jittered backoff) + `p-timeout` (hard ceiling) and chain Yahoo→stock-nse-india→stale-cache for prices, MFAPI→AMFI NAVAll→stale-cache for NAV, RSS→NewsData.io→stale-cache for news. Validate every payload at the adapter boundary with Zod and persist only validated, source-tagged data to Mongo time-series + master collections. Use the verified package versions in the Standard Stack table below.

<user_constraints>
## User Constraints (from CONTEXT.md)

> **No CONTEXT.md exists for this phase.** This phase did not go through `/gsd-discuss-phase` — the locked decisions below were supplied by the orchestrator (project-level locks from PROJECT.md and the parent stack research). Treat them as the same authority as a CONTEXT.md `## Decisions` section.

### Locked Decisions (from project-level constraints + orchestrator brief)

- **Stack:** NestJS 11 + Mongoose 9.6 + MongoDB Atlas (Mumbai `ap-south-1`) + Redis 7.
- **Primary providers:**
  - Stocks: `yahoo-finance2` (Yahoo Finance unofficial wrapper)
  - MF NAV: MFAPI.in (HTTP) + AMFI `NAVAll.txt` (authoritative fallback)
  - NSE supplement: `stock-nse-india` (corporate actions, announcements)
  - News: RSS (MoneyControl / ET) via `rss-parser` + NewsData.io (free tier)
- **Storage:** MongoDB **time-series collections** for price/NAV history (`timeField` + `metaField` = instrumentId). **No Postgres / TimescaleDB.**
- **Validation:** Zod 3.x at every external boundary.
- **Resilience:** `opossum` 8.x circuit breaker per provider; `p-retry` + `p-timeout` per call; multi-source fallback chain that degrades to **stale-but-labeled** cache, never to a blank response.
- **Domain code never touches a provider SDK directly** — only through the port interface in `packages/shared`.
- **Every Redis cache key MUST carry a TTL** (project-wide invariant).
- **No live external API call on a user-facing request path** — ingestion is BullMQ-driven; reports read Mongo + Redis.

### Claude's Discretion

- Exact circuit-breaker thresholds and timeout values (recommended defaults below — tune empirically in Wave 0).
- Exact Redis key naming conventions (recommended below).
- Per-provider concurrency caps and request pacing (recommended; empirically validate).
- Whether to use `bottleneck` for rate-limit pacing (recommended **yes** — see Standard Stack).
- Holiday-calendar source format (recommended: JSON file in `packages/shared/calendars/nse-holidays-{year}.json`, refreshed annually).

### Deferred Ideas (OUT OF SCOPE)

- Paid/licensed real-time tick feeds (PROJECT.md out-of-scope).
- Broker OAuth / portfolio sync (v2, PORT-01).
- Order placement deep links (PROJECT.md out-of-scope).
- F&O / options data ingestion (v3, out-of-scope).
- Multi-language support (v2, LANG-01).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **DATA-01** | Canonical instrument master maps each stock across NSE/BSE/Yahoo symbols and each fund to its AMFI scheme code | `Instrument` + `Fund` Mongoose schemas with unique compound indexes + case-insensitive collation; seed sources (NSE bhav copy, BSE equity master, AMFI NAVAll) documented under *Sources for Instrument Master Seed* |
| **DATA-02** | Provider adapters fetch stock prices/fundamentals (Yahoo), MF NAV (MFAPI/AMFI), and news (RSS/NewsData) behind a common interface | `PriceProvider`/`FundProvider`/`NewsProvider` ports in `packages/shared`; discriminated `Ok | Stale | Err` return; method-level signatures documented under *Architecture Patterns → Pattern 1* |
| **DATA-03** | Multi-source fallback chain with circuit breaker serves stale-but-labeled data instead of failing when a source is down | `opossum` 9.x per-provider state; per-metric chain `primary → secondary → tertiary → stale-cache`; `Stale<T>` envelope carries `stalenessSeconds` + `source`; pattern documented under *Architecture Patterns → Pattern 2* |
| **DATA-04** | Every external payload is schema-validated at ingestion before persistence | Zod 4.x schemas defined adjacent to each adapter; `parse()` (throws) at the boundary; failures logged with `pino` + source/url/correlationId and counted as `provider.validation_failed` metric; payload NEVER reaches Mongo |
| **DATA-05** | Price history is stored adjusted for splits/corporate actions, using a market-holiday calendar | MongoDB time-series collection `price_history` (always-adjusted); corporate-action adjustment strategy (`yahoo-finance2` `adjClose` + manual back-adjust on detected discrepancy from `stock-nse-india` corporate actions feed); NSE holiday calendar JSON; session detection (09:15–15:30 IST) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

The repo's `CLAUDE.md` is a **GSD developer profile** (communication/decision style), not a code rulebook — there are no project-specific code directives to enforce here. The user-global `~/.claude/CLAUDE.md` contributes platform/universal rules; the ones directly load-bearing on this phase are:

- **`security/no-hardcoded-secrets` [MUST]** — NewsData.io API key, any future provider keys load from env / secret manager only.
- **`universal/no-empty-catch` [MUST]** — every adapter try/catch logs structured error and either rethrows or returns `Err`. Silent swallow is forbidden.
- **`universal/no-bare-any` [MUST]** — external responses typed as `unknown`, then narrowed by Zod parse. No `any` in adapter signatures.
- **`universal/test-file-exists` [MUST]** — every adapter, every provider chain, every Zod schema gets a co-located test file.
- **`universal/behavior-first-testing` [MUST]** — adapter tests assert the discriminated-union envelope shape and fallback ordering, not internal call counts.
- **`backend/no-console-log`** (Platform rule cited in user CLAUDE.md, scoped to `@platform-core/logger`) — **NOT applicable** to this FinSight repo; we use `pino` via `nestjs-pino`. Document this divergence so the planner doesn't try to import a `@platform-core` package that doesn't exist in this repo.
- **`backend/require-dto-validation` [MUST]** — any HTTP endpoint exposed by `DataIngestionModule` (admin re-ingest trigger, instrument lookup) uses `class-validator` DTOs. External payloads use Zod (different boundary — class-validator is for our API surface; Zod is for what we *receive* from upstream).
- **`backend/multi-tenancy-scoping`** — **NOT applicable** (FinSight is single-tenant for v1; no `locationId`).
- **`data/redis-always-ttl` [MUST]** — every cache key in this phase declares an explicit TTL (see *Cache TTL Policy* table).
- **`data/redis-scan-not-keys` [MUST]** — admin tooling for cache inspection uses `SCAN`, never `KEYS *`.

> **CONFLICT note for planner:** The user-global rule `backend/no-console-log → use @platform-core/logger` belongs to a different org (`leadgen` / `gohighlevel`). FinSight uses `nestjs-pino`. This phase should **not** install or reference `@platform-core/*`.

## Standard Stack

### Core (verified live against npm registry, 2026-05-28)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `yahoo-finance2` | `3.14.1` | Primary stock prices, fundamentals, historical | `[VERIFIED: npm view]` Locked by project; only actively maintained Yahoo Node lib (`gadicc/node-yahoo-finance2`). Modules: `chart`, `historical`, `quote`, `quoteSummary`, `fundamentalsTimeSeries`, `search`, `insights`, `recommendationsBySymbol`. `[VERIFIED: GitHub README]` |
| `stock-nse-india` | `1.4.0` | NSE supplement (corporate actions, announcements, gainers/losers) | `[VERIFIED: npm view]` Locked. **Supplement only** — NSE actively blocks datacenter IPs; always cache + fallback to Yahoo. `[CITED: STACK.md]` |
| `rss-parser` | `3.13.0` | MoneyControl / Economic Times RSS news ingestion | `[VERIFIED: npm view]` Stable, well-typed. Dedupe by guid/url. |
| `zod` | `4.4.3` | Schema validation at every external boundary | `[VERIFIED: npm view]` 4.x is current stable. (Project brief mentioned "Zod 3.x" — **4.4.3 is the current major**; use 4.x. Migration is minor for our use; flagged so planner picks `^4.4.3` not `^3`.) `[ASSUMED]` decision to recommend 4.x over 3.x — see Assumptions Log. |
| `opossum` | `9.0.0` | Circuit breaker per provider | `[VERIFIED: npm view]` De facto Node circuit breaker (Nodeshift/Red Hat). Per-instance state, half-open retry, EventEmitter for metrics. (Brief said "8.x" — **9.0.0 is current**; API is stable across the 8→9 transition for our usage; recommend 9.) `[ASSUMED]` decision to pin 9.x — see Assumptions Log. |
| `p-retry` | `8.0.0` | Jittered exponential backoff for retryable failures | `[VERIFIED: npm view]` Sindresorhus standard. Promise-native, AbortSignal support. |
| `p-timeout` | `7.0.1` | Hard ceiling on a single provider call | `[VERIFIED: npm view]` Pair with `p-retry`. |
| `bottleneck` | `2.19.5` | Per-provider request pacing / concurrency cap | `[VERIFIED: npm view]` Token-bucket rate limiter; share across cluster via Redis if needed. Prevents bursts from triggering Yahoo/NSE 429s. |
| `ioredis` | `5.11.0` | Redis client (already in stack from Phase 1) | `[VERIFIED: npm view]` BullMQ uses it under the hood; share one connection config. |
| `nestjs-pino` | `4.6.1` | Structured logging (correlation IDs, JSON) | `[VERIFIED: npm view]` Locked logger for the project; auto-attaches request-scoped child logger; bind `provider`, `correlationId`, `url`, `latencyMs` per call. |
| `pino` | `10.3.1` | Underlying logger | `[VERIFIED: npm view]` Fast JSON logger. |
| `@nestjs/schedule` | `6.1.3` | Cron-style scheduler for some lightweight jobs | `[VERIFIED: npm view]` Use **BullMQ repeatable jobs** for the heavy ingestion crons (idempotent, retryable). `@nestjs/schedule` is fine for lightweight tickers (e.g., daily AMFI download trigger if you want a non-queue scheduler). Default: BullMQ for everything ingestion-related. |
| `@nestjs/bullmq` | `11.0.4` | BullMQ queue module (from Phase 1) | `[VERIFIED: STACK.md / npm view]` Worker classes process ingestion jobs. |
| `bullmq` | `5.77.x` | Underlying queue (from Phase 1) | `[VERIFIED: STACK.md]` Repeatable jobs (cron) for `nightly-amfi-nav`, `nightly-mf-scheme-refresh`, `news-poll` (every 30 min), `eod-yahoo-fundamentals`. |
| `@nestjs/terminus` | `11.1.1` | Health checks for upstream providers | `[VERIFIED: npm view]` Add per-provider `HealthIndicator` that exposes circuit-breaker state on `/health`. |
| `luxon` | `3.7.2` | IST/UTC date math, market-session detection | `[VERIFIED: npm view]` Better timezone story than `date-fns-tz` for `Asia/Kolkata`-heavy code. Use for "is now within 09:15–15:30 IST on a trading day?" |
| `mongoose` / `@nestjs/mongoose` | `9.6.x` / `11.0.x` | ODM + Nest module (from Phase 1) | `[VERIFIED: STACK.md]` Time-series collections via `timeseries: { timeField, metaField, granularity }` in `@Schema()` options. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `axios` | `1.16.1` | HTTP client for MFAPI / AMFI / NewsData | `[VERIFIED: npm view]` Already a transitive dep of many libs; explicit interceptor for `correlationId` injection. Alternative: native `fetch` (Node 24 ships it) — pick **one** and use it everywhere in adapters. Recommend `axios` for interceptor ergonomics. |
| `nanoid` | `5.1.11` | Correlation IDs | `[VERIFIED: npm view]` Per-ingestion-job + per-external-call correlation ID; attached to log lines + propagated through fallback chain. |
| `@nestjs/throttler` | `6.5.0` | Rate-limit our own ingestion-trigger admin endpoints | `[VERIFIED: npm view]` Defense in depth on admin-facing endpoints. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `opossum` | Hand-rolled state machine | Don't — opossum has half-open, metrics, EventEmitter, well-tested. |
| `zod` 4.x | `zod` 3.x | 3.x is in long-term maintenance; **prefer 4.x** for new code. Migration cost from 3→4 is minor for schema-validation usage we do here. |
| `bottleneck` | `p-throttle` | `bottleneck` has Redis clustering + reservoirs; pick it if you ever scale beyond one ingestion worker. `p-throttle` is simpler but single-process. Recommend bottleneck. |
| `axios` | Native `fetch` | Both work. `axios` gives interceptors (correlation ID) and friendly error semantics. Pick one consistently. |
| `luxon` | `date-fns-tz` | Both handle `Asia/Kolkata`. `luxon` has a cleaner `DateTime` immutable model for market-session math. |
| MongoDB time-series collection | Regular collection with `{symbol, ts}` compound index | TS collection gives 70%+ storage compression + bucket optimization for range scans. Locked. |
| Custom market-holiday parser | `nse-holiday-calendar` npm packages | All candidate npm holiday packages are stale (last published 2+ years ago). Bundle our own **JSON file in repo** generated from the official NSE list, refresh annually. `[ASSUMED]` — verify no maintained package emerged in 2025. |

### Installation

```bash
# In apps/api
pnpm add yahoo-finance2 stock-nse-india rss-parser axios
pnpm add zod opossum p-retry p-timeout bottleneck
pnpm add nestjs-pino pino luxon nanoid
pnpm add @nestjs/schedule @nestjs/terminus
# (already from Phase 1: @nestjs/bullmq bullmq ioredis mongoose @nestjs/mongoose)

# Dev
pnpm add -D @types/luxon
```

**Version verification (live npm registry, 2026-05-28):**
- `yahoo-finance2@3.14.1`, `stock-nse-india@1.4.0`, `rss-parser@3.13.0`, `zod@4.4.3`, `opossum@9.0.0`, `p-retry@8.0.0`, `p-timeout@7.0.1`, `bottleneck@2.19.5`, `ioredis@5.11.0`, `nestjs-pino@4.6.1`, `pino@10.3.1`, `@nestjs/schedule@6.1.3`, `@nestjs/terminus@11.1.1`, `luxon@3.7.2`, `axios@1.16.1`, `nanoid@5.1.11`, `@nestjs/throttler@6.5.0` — all `[VERIFIED: npm view <pkg> version 2026-05-28]`.

## Architecture Patterns

### Recommended Project Structure

```
apps/api/src/
  data-ingestion/
    data-ingestion.module.ts
    adapters/
      yahoo/
        yahoo.adapter.ts            # implements PriceProvider via yahoo-finance2
        yahoo.schemas.ts            # Zod schemas for chart, quote, quoteSummary
        yahoo.adapter.spec.ts
      nse/
        nse.adapter.ts              # stock-nse-india, supplement
        nse.schemas.ts
      mfapi/
        mfapi.adapter.ts            # implements FundProvider primary
        mfapi.schemas.ts
      amfi/
        amfi.adapter.ts             # NAVAll.txt parser; FundProvider fallback
        amfi.parser.ts              # pure parser; unit-tested standalone
        amfi.schemas.ts
      rss-news/
        rss-news.adapter.ts         # rss-parser → NewsProvider primary
        rss-news.schemas.ts
      newsdata-io/
        newsdata-io.adapter.ts      # NewsProvider supplement
        newsdata-io.schemas.ts
    chains/
      price-chain.ts                # yahoo → nse → stale-cache
      fund-chain.ts                 # mfapi → amfi → stale-cache
      news-chain.ts                 # rss → newsdata.io → stale-cache
    circuit/
      breaker.factory.ts            # opossum wrapper with consistent thresholds
      breaker.health.indicator.ts   # @nestjs/terminus exposes state on /health
    cache/
      stale-cache.service.ts        # Redis read with explicit stalenessSeconds
    jobs/
      nightly-amfi-nav.processor.ts
      nightly-mf-scheme-refresh.processor.ts
      news-poll.processor.ts
      eod-yahoo-fundamentals.processor.ts
      instrument-master-seed.processor.ts
    instrument-master/
      instrument.schema.ts          # @Schema() for stocks
      fund.schema.ts                # @Schema() for funds
      instrument.repository.ts
      fund.repository.ts
      lookup.service.ts             # symbol resolution
      seed/
        nse-bhavcopy.seed.ts
        bse-equity-master.seed.ts
        amfi-scheme-master.seed.ts
    price-history/
      price-history.schema.ts       # TIME-SERIES collection
      price-history.repository.ts
      adjustment.service.ts         # split/bonus/dividend back-adjust
    calendar/
      market-holiday.service.ts     # NSE holiday calendar + session detection
      nse-holidays-2026.json
      nse-holidays-2027.json

packages/shared/src/
  providers/
    price-provider.port.ts          # interface + Ok/Stale/Err union
    fund-provider.port.ts
    news-provider.port.ts
    provider-result.ts              # discriminated union types
  instruments/
    instrument.dto.ts               # canonical Instrument shape
    fund.dto.ts                     # canonical Fund shape
  calendars/
    holiday-calendar.types.ts
```

### Pattern 1: Provider Port + Discriminated Result Envelope

**What:** A single port interface per data domain, returning a discriminated union so callers cannot ignore staleness or errors at the type level.

**When to use:** Every external data fetch. No domain code calls a vendor SDK directly.

```typescript
// packages/shared/src/providers/provider-result.ts
export type ProviderResult<T> =
  | { status: 'ok';    data: T; source: string; fetchedAt: Date }
  | { status: 'stale'; data: T; source: string; fetchedAt: Date; stalenessSeconds: number }
  | { status: 'err';   reason: 'timeout' | 'open-circuit' | 'validation' | 'rate-limited' | 'upstream-5xx' | 'not-found' | 'unknown';
       message: string; source: string };

// packages/shared/src/providers/price-provider.port.ts
export interface PriceProvider {
  getLatestQuote(yahooSymbol: string): Promise<ProviderResult<Quote>>;
  getDailyHistory(yahooSymbol: string, from: Date, to: Date): Promise<ProviderResult<OHLCVBar[]>>;
  getFundamentals(yahooSymbol: string, modules: QuoteSummaryModule[]): Promise<ProviderResult<Fundamentals>>;
}

// packages/shared/src/providers/fund-provider.port.ts
export interface FundProvider {
  getLatestNav(schemeCode: string): Promise<ProviderResult<NavSnapshot>>;
  getNavHistory(schemeCode: string): Promise<ProviderResult<NavPoint[]>>;
  listSchemes(): Promise<ProviderResult<SchemeMaster[]>>;
}

// packages/shared/src/providers/news-provider.port.ts
export interface NewsProvider {
  getRecentForInstrument(instrumentId: string, since: Date): Promise<ProviderResult<NewsItem[]>>;
}
```

The discriminated union forces every caller (scoring engine, narrative job, report controller) to handle `stale` explicitly. A `stale` result is acceptable for v1 (15-minute-delayed display is allowed by PROJECT.md), but it must be **labeled in the UI** ("data as of … — upstream temporarily unavailable").

### Pattern 2: Fallback Chain with Per-Provider Circuit Breaker

**What:** Primary → secondary → tertiary → stale-cache. Each step is wrapped in its own `opossum` breaker; an `open` breaker short-circuits to the next provider without making a network call.

**When to use:** Every metric. Per-metric chain is configured explicitly — no implicit ordering.

```typescript
// apps/api/src/data-ingestion/circuit/breaker.factory.ts
import CircuitBreaker from 'opossum';
import { Logger } from 'nestjs-pino';

export function createProviderBreaker<TArgs extends any[], TResult>(
  call: (...args: TArgs) => Promise<TResult>,
  opts: { name: string; timeoutMs: number; errorThresholdPercentage?: number; resetTimeoutMs?: number; logger: Logger },
): CircuitBreaker<TArgs, TResult> {
  const breaker = new CircuitBreaker(call, {
    timeout: opts.timeoutMs,                       // hard ceiling per call
    errorThresholdPercentage: opts.errorThresholdPercentage ?? 50, // open after 50% errors
    resetTimeout: opts.resetTimeoutMs ?? 30_000,   // half-open after 30s
    rollingCountTimeout: 60_000,                   // 1-minute window
    rollingCountBuckets: 10,
    name: opts.name,
  });
  breaker.on('open',     () => opts.logger.warn({ provider: opts.name }, 'circuit_open'));
  breaker.on('halfOpen', () => opts.logger.log({ provider: opts.name }, 'circuit_half_open'));
  breaker.on('close',    () => opts.logger.log({ provider: opts.name }, 'circuit_close'));
  breaker.on('reject',   () => opts.logger.warn({ provider: opts.name }, 'circuit_rejected_short_circuit'));
  return breaker;
}
```

```typescript
// apps/api/src/data-ingestion/chains/price-chain.ts (sketch)
async function getLatestQuote(yahooSymbol: string): Promise<ProviderResult<Quote>> {
  // 1) Try Yahoo (primary)
  const yahoo = await yahooBreaker.fire(yahooSymbol).then(toOk).catch(toErr);
  if (yahoo.status === 'ok') {
    await staleCache.write(`price:${yahooSymbol}`, yahoo.data, TTL_15M);
    return yahoo;
  }

  // 2) Fallback: NSE wrapper
  const nse = await nseBreaker.fire(toNseSymbol(yahooSymbol)).then(toOk).catch(toErr);
  if (nse.status === 'ok') {
    await staleCache.write(`price:${yahooSymbol}`, nse.data, TTL_15M);
    return nse;
  }

  // 3) Final fallback: stale cache labeled
  const stale = await staleCache.read<Quote>(`price:${yahooSymbol}`);
  if (stale) {
    return { status: 'stale', data: stale.value, source: stale.source, fetchedAt: stale.fetchedAt,
             stalenessSeconds: Math.floor((Date.now() - stale.fetchedAt.getTime()) / 1000) };
  }

  return { status: 'err', reason: 'unknown', message: 'all_providers_exhausted', source: 'chain' };
}
```

**Recommended thresholds** (tune empirically in Wave 0 with `:smoke` traffic; these are starting points):

| Provider | `timeoutMs` | `errorThresholdPercentage` | `resetTimeoutMs` | Concurrency (bottleneck) |
|----------|-------------|----------------------------|------------------|--------------------------|
| Yahoo (`yahoo-finance2`) | 8000 | 50 | 30_000 | maxConcurrent 4, minTime 250ms |
| `stock-nse-india` | 10_000 | 40 (NSE is flakier) | 60_000 | maxConcurrent 2, minTime 500ms |
| MFAPI.in | 6000 | 50 | 30_000 | maxConcurrent 5, minTime 200ms |
| AMFI NAVAll.txt | 30_000 (large file) | n/a (only nightly job, retry instead) | n/a | maxConcurrent 1 |
| NewsData.io | 6000 | 50 | 60_000 | maxConcurrent 1, minTime 500ms (free-tier quota) |
| RSS (MoneyControl/ET) | 5000 | 50 | 30_000 | maxConcurrent 2, minTime 1000ms |

### Pattern 3: Validate-at-Boundary with Zod

**What:** Every external response is parsed by a Zod schema co-located with its adapter. Validation failure is a structured error, never a silent write.

**When to use:** Every adapter. Mandatory.

```typescript
// apps/api/src/data-ingestion/adapters/yahoo/yahoo.schemas.ts
import { z } from 'zod';

export const YahooQuoteSchema = z.object({
  symbol: z.string(),
  regularMarketPrice: z.number().finite(),
  regularMarketTime: z.union([z.date(), z.number()]).transform((v) => v instanceof Date ? v : new Date(Number(v) * 1000)),
  currency: z.literal('INR'),
  exchange: z.enum(['NSI', 'BSE']),
}).passthrough(); // tolerate extra fields Yahoo may add

export const YahooOHLCBarSchema = z.object({
  date: z.coerce.date(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  adjClose: z.number().finite(),
  volume: z.number().int().nonnegative(),
});
```

```typescript
// apps/api/src/data-ingestion/adapters/yahoo/yahoo.adapter.ts (sketch)
async getLatestQuote(yahooSymbol: string): Promise<ProviderResult<Quote>> {
  try {
    const raw: unknown = await yahooFinance.quote(yahooSymbol);
    const parsed = YahooQuoteSchema.parse(raw);  // throws on schema mismatch
    return { status: 'ok', data: toCanonicalQuote(parsed), source: 'yahoo-finance2', fetchedAt: new Date() };
  } catch (err) {
    if (err instanceof z.ZodError) {
      this.logger.error({ provider: 'yahoo', yahooSymbol, issues: err.issues }, 'schema_validation_failed');
      return { status: 'err', reason: 'validation', message: err.message, source: 'yahoo-finance2' };
    }
    throw err; // let circuit breaker count it
  }
}
```

**Key rule:** the result of `parse()` (not `safeParse()`) is the only shape that may pass to `toCanonicalQuote()`. The canonical shape is then what touches Mongo. The raw upstream object **never** does.

### Pattern 4: Canonical Instrument Master with Case-Insensitive Lookup

**What:** One Mongo document per real-world instrument with all external symbols, indexed for fast lookup with case-insensitive collation.

```typescript
// apps/api/src/data-ingestion/instrument-master/instrument.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InstrumentDocument = HydratedDocument<Instrument>;

@Schema({ collection: 'instruments', timestamps: true,
         // strength:2 = case-insensitive but accent-sensitive (good for Indian ticker lookups)
         collation: { locale: 'en', strength: 2 } })
export class Instrument {
  @Prop({ required: true, unique: true, sparse: true })  isin?: string;          // INE002A01018
  @Prop({ required: true, unique: true })                 nseSymbol!: string;     // RELIANCE
  @Prop({ sparse: true })                                 bseCode?: string;       // 500325
  @Prop({ required: true, unique: true })                 yahooSymbol!: string;   // RELIANCE.NS
  @Prop({ required: true })                               name!: string;
  @Prop({ required: true, enum: ['NSE', 'BSE'] })         primaryExchange!: 'NSE' | 'BSE';
  @Prop({ required: true, default: 'INR' })               currency!: string;
  @Prop()                                                 sector?: string;        // GICS-style
  @Prop()                                                 industry?: string;
  @Prop()                                                 marketCapCategory?: 'LARGE' | 'MID' | 'SMALL';
  @Prop({ default: true })                                isActive!: boolean;     // for delisted survivorship handling
}

export const InstrumentSchema = SchemaFactory.createForClass(Instrument);
InstrumentSchema.index({ nseSymbol: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
InstrumentSchema.index({ yahooSymbol: 1 }, { unique: true });
InstrumentSchema.index({ bseCode: 1 }, { unique: true, sparse: true });
InstrumentSchema.index({ isin: 1 }, { unique: true, sparse: true });
InstrumentSchema.index({ name: 'text' });  // for search seed (Phase 5 will add Atlas Search)
```

```typescript
// apps/api/src/data-ingestion/instrument-master/fund.schema.ts
@Schema({ collection: 'funds', timestamps: true,
         collation: { locale: 'en', strength: 2 } })
export class Fund {
  @Prop({ required: true, unique: true })  schemeCode!: string;     // AMFI scheme code (string — leading zeros matter)
  @Prop({ sparse: true })                   isin?: string;
  @Prop({ required: true })                 amcCode!: string;       // e.g., HDFCMF
  @Prop({ required: true })                 name!: string;
  @Prop({ required: true, enum: ['DIRECT', 'REGULAR'] }) plan!: 'DIRECT' | 'REGULAR';
  @Prop({ required: true, enum: ['GROWTH', 'IDCW'] })    option!: 'GROWTH' | 'IDCW';
  @Prop({ required: true })                 category!: string;       // Equity-Large Cap / Debt-Liquid / Hybrid-Aggressive / …
  @Prop()                                   benchmark?: string;       // NIFTY 50 TRI etc.
  @Prop({ default: true })                  isActive!: boolean;
}
// Unique constraint that catches the most common bug — same fund, different plan/option drift:
FundSchema.index({ schemeCode: 1 }, { unique: true });
FundSchema.index({ amcCode: 1, name: 1, plan: 1, option: 1 }, { unique: true });
FundSchema.index({ name: 'text' });
```

### Pattern 5: MongoDB Time-Series Price History (Always Adjusted)

**What:** One document per instrument per day (or per minute for intraday if ever needed), stored in a TS collection with `metaField` set to the canonical instrument ID. Prices are **always** split/bonus/dividend-adjusted at write time.

```typescript
// apps/api/src/data-ingestion/price-history/price-history.schema.ts
@Schema({
  collection: 'price_history',
  timeseries: {
    timeField: 'ts',
    metaField: 'meta',
    granularity: 'hours',   // 'hours' is the right pick for EOD bars; use 'minutes' only if you go intraday
  },
  // NOTE: TS collections in MongoDB 6.0+ allow updates as of 5.0 with restrictions; for v1 we treat them as append-only
})
export class PriceHistoryPoint {
  @Prop({ required: true })                           ts!: Date;             // 09:00 IST close-of-day timestamp normalised
  @Prop({ required: true, type: Object })             meta!: {
    instrumentId: string;     // canonical Mongo _id of instruments doc
    source: string;           // 'yahoo' | 'nse' (which provider supplied this bar)
    isAdjusted: true;         // always true — invariant
  };
  @Prop({ required: true }) open!: number;
  @Prop({ required: true }) high!: number;
  @Prop({ required: true }) low!: number;
  @Prop({ required: true }) close!: number;       // adjusted close
  @Prop({ required: true }) volume!: number;
  @Prop()                   rawClose?: number;    // store unadjusted for audit
  @Prop({ default: 1.0 })   adjustmentFactor!: number; // cumulative adj factor on this bar
}
```

For funds, an analogous `nav_history` time-series collection keyed by `schemeCode`.

**Adjustment strategy:**
- `yahoo-finance2` `historical` and `chart` modules return both `close` and `adjClose`. **Persist `adjClose` as `close`.**
- On every nightly fetch, if today's `rawClose / previousRawClose` ratio is < 0.9 or > 1.1 (a >10% single-day move on a non-circuit-hit day), cross-check `stock-nse-india` corporate actions feed for a split/bonus on that ex-date. If found, **rewrite** historical bars before that date with the adjustment factor.
- For dividends, Yahoo's `adjClose` already incorporates them — do not double-adjust.
- Track `adjustmentFactor` so the audit trail shows when a re-adjustment happened.

### Pattern 6: Stale-Cache as a First-Class Result, Not an Exception

The Redis key for each metric stores `{ value, source, fetchedAt }`. When the live chain fails, the chain reads this key and returns `Stale<T>` with `stalenessSeconds = now - fetchedAt`. The downstream consumer (report controller, narrative job) decides whether to surface, hide, or downgrade based on `stalenessSeconds`.

This is **not** an extra cache layer — it's the same Redis cache the live path writes to on success. The only difference is the read happens *after* the live chain fails.

### Anti-Patterns to Avoid

- **Calling `yahoo-finance2` directly from a controller** — violates port abstraction; impossible to swap source or add fallback. **All access goes through `PriceProvider`.**
- **`safeParse()` everywhere with silent fallback to upstream raw shape** — Zod must `parse()` (throw) at the boundary, or you reintroduce the "garbage in" bug.
- **Mixing direct vs regular plans under one fund document** — different scheme codes, different NAVs. Always key on `schemeCode + plan + option`.
- **Storing unadjusted prices alongside adjusted with no marker** — pick one canonical store (adjusted) and an audit field (`rawClose`).
- **Computing "today's change" without checking the holiday calendar** — produces fake moves on `Saturday/Sunday/Republic Day/Diwali Muhurat`.
- **One global circuit breaker** — must be per-provider per-method; one failing endpoint shouldn't open the circuit for another.
- **Calling `KEYS price:*` for cache eviction** — use `SCAN` (project rule `data/redis-scan-not-keys`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Circuit breaker (open/half-open/close states with rolling error windows) | Custom state machine | `opossum@9` | Hard to get half-open right; opossum has metrics + EventEmitter integrations + battle-tested across Red Hat/IBM. |
| Retry with jittered exponential backoff | Custom loop | `p-retry@8` + `p-timeout@7` | AbortSignal-aware, well-typed, handles `signal: AbortSignal` and unrecoverable errors via `AbortError`. |
| Rate-limit pacing across many in-flight requests | Custom token bucket | `bottleneck@2` | Cluster-aware via Redis if you scale; reservoirs; priority queues — none of which you want to reinvent. |
| Schema validation of unknown JSON | Hand-written type guards | `zod@4` | Composable, parses + narrows, error messages map directly to log fields, supports `passthrough()` for forward-compat. |
| RSS parsing (atom/rss/rdf variants) | Custom XML parser | `rss-parser@3` | Handles spec variants, MoneyControl/ET specifics, normalises pubDate. |
| AMFI NAVAll line splitting | Treat as CSV | Custom **pure-function** parser (~30 LOC, unit-tested) | AMFI format is `;`-delimited with section headers — a CSV lib will choke on the section banners. Hand-roll the parser **but** keep it pure and unit-tested in isolation (`amfi.parser.ts`). |
| Yahoo crumb/cookie auth | Manage cookies yourself | `yahoo-finance2` (handles it internally) | The lib refreshes the crumb when Yahoo rotates. |
| NSE session cookies + browser-like headers | Custom requestor | `stock-nse-india` | Already encapsulates the cookie dance. Still treat as fragile and supplement only. |
| Indian-market holiday calendar | Hard-code a few obvious dates | **JSON file in repo, regenerated annually from official NSE list** | npm packages for NSE holidays are stale; bundling the list is two minutes a year. |
| Correlation ID generation | UUID v4 strings | `nanoid@5` | Smaller (21 chars), URL-safe, faster, sufficient entropy. |
| Logger | `console.log` | `pino` via `nestjs-pino` | Project standard; structured JSON; request-scoped child loggers. |
| Cron scheduling | `setInterval` | **BullMQ repeatable jobs** | Persistent, retryable, idempotent, observable through BullBoard. |
| Health checks | Custom `/healthz` route | `@nestjs/terminus` + custom `BreakerHealthIndicator` | Exposes Mongo/Redis/breaker state in one envelope. |

**Key insight:** Every item in this table represents a class of bugs (lost requests, double-charges-to-free-quota, false-positive circuit opens, malformed prices in scoring) that you only discover in production. The libraries above have absorbed those bugs already.

## Runtime State Inventory

**Phase 2 is greenfield ingestion** — no rename / refactor / migration involved. The repo currently has no scaffolded code (`ls /Users/milankatia/Desktop/personal/tracker/` shows only `CLAUDE.md` and `FinSight_AI_PRD.docx`). Section omitted.

## Common Pitfalls

### Pitfall 1: Free-tier provider fragility (silent shape drift, sudden 429s, IP blocks)

**What goes wrong:** Yahoo rotates the crumb token and stale crumbs return 401; NSE blocks the egress IP range when concurrency creeps up; MFAPI returns a different field name after a quiet refresh; AMFI section headers change. All of this manifests as `null`s in the price history, plausible-but-wrong scores, or 500s on the report page.

**Why it happens:** None of these are contracted APIs. They work flawlessly in dev with two requests per hour; they fail under realistic concurrency.

**How to avoid:**
- Schema validation at the boundary (`Zod parse()` — throw on mismatch). A shape change becomes a *loud* validation error, not silent corruption.
- Per-provider circuit breaker — one provider failing doesn't drag down the chain.
- Stale-cache fallback as a **first-class result type**.
- Aggressive concurrency cap with `bottleneck` (table above) — never burst more than 4 Yahoo calls in flight.
- Empirical Wave 0 rate-limit probe per provider before opening the gate to the BullMQ batch jobs.
- Daily alert: if `provider.validation_failed` counter > 0 in the last 24h, page a human.

**Warning signs:** intermittent `null`s in `price_history.close`; `validation_failed` log lines; 429s in Yahoo response; sudden `stalenessSeconds` jumps in report payloads.

### Pitfall 2: Corporate-action gaps producing fake crashes / fake doubles

**What goes wrong:** A stock splits 1:5 overnight. The unadjusted close drops from ₹2,500 to ₹500. A score that uses 30-day return reads as `-80%` volatility-blowup. The deterministic scoring engine outputs an alarmist score. The chart on the report shows a vertical cliff.

**Why it happens:** Either the historical fetch used unadjusted `close` instead of `adjClose`, or the adjustment lagged (Yahoo's `adjClose` propagated next day; on the morning after a split, intraday reads can be inconsistent).

**How to avoid:**
- **Always** persist `adjClose` as the canonical `close`. Never persist raw close as canonical.
- On every nightly ingest, run the day-over-day ratio check (described in Pattern 5). If `>10%` move and no circuit-hit market news, cross-check `stock-nse-india` corporate actions. If a split/bonus matches, retroactively rewrite priors with the cumulative adjustment factor.
- Snapshot-test: a known recent split (e.g., MRF or BAJAJ-AUTO when they next split) reads back to a smooth curve.
- Audit field `rawClose` retained for forensics.

**Warning signs:** chart vertical cliff on a date matching a corporate-action notice; sudden volatility spike for one stock and no others; the volatility pillar weights an instrument 10× higher than its peers.

### Pitfall 3: Mutual fund scheme-code / plan / option conflation

**What goes wrong:** "HDFC Top 100 Fund" exists in (Direct, Growth), (Direct, IDCW), (Regular, Growth), (Regular, IDCW) — four distinct AMFI scheme codes. A user search returns one and the returns shown are for another. NAV continuity breaks across scheme mergers (small-cap merged into another fund three years ago).

**Why it happens:** The temptation is to key by AMC + name. AMFI's `schemeCode` is the only canonical key, and even it changes when a scheme merges or is renamed.

**How to avoid:**
- **Key on `schemeCode` alone** as primary; **also** enforce a unique compound index on `(amcCode, name, plan, option)` to catch ingestion bugs.
- Store `plan` and `option` as explicit enums (`DIRECT|REGULAR`, `GROWTH|IDCW`) — never derive from name string substrings.
- On scheme rename or merger (detected when NAVAll changes `schemeName` for an existing `schemeCode`), keep history; flag in `Fund.isActive=false` for the deprecated code; map forward via a `successorSchemeCode` field if needed.
- Validate NAV continuity: a day-over-day NAV move > 10% on a fund (not market-driven) is a re-classification/merger signal — flag for review.

**Warning signs:** two funds in search results with the same name; impossible returns ("HDFC Top 100" up 80% in a year); NAV history showing a discontinuity on a date that isn't in any holiday list.

### Pitfall 4: Indian market-calendar blindness — fake "today's change" on non-trading days

**What goes wrong:** Saturday morning the report shows "today's change −2.4%" because the EOD job ran but the market was closed. Diwali Muhurat trading (a 1-hour ceremonial session) confuses the session detector. Pre-open auction prints aren't real trades.

**How to avoid:**
- NSE holiday list as JSON in repo (`nse-holidays-{year}.json`), refreshed annually (lightweight; the list is published once a year).
- `MarketHolidayService.isTradingDay(date)` and `isInTradingSession(now)` (09:15–15:30 IST) using `luxon` with `Asia/Kolkata`.
- "Today's change" is computed only when `isTradingDay(today) === true`; otherwise the UI shows "Last close: <date>".
- Muhurat trading is a known one-off — encode it as a separate `MUHURAT` session in the holiday JSON (`{ date, type: 'MUHURAT_SESSION', from: '18:00', to: '19:00' }`).

**Warning signs:** weekend reports showing changes; "today's change" on Republic Day; pre-09:15 quotes flagged as live.

### Pitfall 5: NSE / Yahoo unofficial-API silent breakage under load

**What goes wrong:** Works fine in dev with 5 stocks. In staging with 500 instruments fanned out by BullMQ, Yahoo returns sporadic `null` for `regularMarketPrice` (rate-limit symptom); NSE outright blocks the IP after 50 sequential requests.

**How to avoid:**
- `bottleneck` per provider (table above).
- **Empirical Wave 0 probe** — run the full instrument fan-out at 10%, 25%, 50%, 100% concurrency in staging and measure error rate. Adjust `bottleneck` accordingly **before** enabling the nightly job in prod.
- Jittered backoff via `p-retry` (avoid synchronised retry storms).
- Per-provider `nestjs-pino` log line per call with `latencyMs` + `status` so Grafana can chart degradation.

**Warning signs:** error rate climbing with concurrency; 429s in Yahoo; HTTP 401/403 from NSE; ingestion job runtime growing super-linearly with instrument count.

### Pitfall 6: Validation bypass — `safeParse()` with fallback-to-raw

**What goes wrong:** Developer wants ingestion to "be resilient" so they use `safeParse()` and fall back to writing the raw upstream object if it fails. Now garbage flows into Mongo and scoring breaks silently.

**How to avoid:** **`.parse()` only at the boundary**, and a `ZodError` catch returns `{ status: 'err', reason: 'validation' }` — never persists. If a schema is too strict and rejects valid data, **widen the schema** (with `passthrough()` for unknown fields) — don't downgrade to `safeParse + fallback`.

**Warning signs:** any commit adding `.safeParse(` in an adapter; any catch block that writes raw upstream into Mongo.

### Pitfall 7: Explicit Gemini context cache misuse — not a Phase 2 issue but data-shape consequence

**Not in scope for Phase 2** but mentioned because ingestion shape downstream affects the narrative cache key. Ensure each canonical record exposes a `dataVersionHash` (e.g., `sha1` of `[isin, lastFundamentalUpdate, lastPriceUpdate]`) so Phase 4's narrative cache can invalidate correctly. **Add this field now**, not later.

## Code Examples

### Yahoo adapter implementing `PriceProvider`

```typescript
// apps/api/src/data-ingestion/adapters/yahoo/yahoo.adapter.ts
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import yahooFinance from 'yahoo-finance2';
import { z } from 'zod';
import Bottleneck from 'bottleneck';
import pRetry, { AbortError } from 'p-retry';
import pTimeout from 'p-timeout';
import { PriceProvider, ProviderResult, Quote, OHLCVBar } from '@finsight/shared';
import { YahooQuoteSchema, YahooOHLCBarSchema } from './yahoo.schemas';

@Injectable()
export class YahooAdapter implements PriceProvider {
  private readonly limiter = new Bottleneck({ maxConcurrent: 4, minTime: 250 });

  constructor(@InjectPinoLogger(YahooAdapter.name) private readonly logger: PinoLogger) {}

  async getLatestQuote(yahooSymbol: string): Promise<ProviderResult<Quote>> {
    const correlationId = this.logger.logger.bindings().correlationId;
    try {
      const raw = await this.limiter.schedule(() =>
        pRetry(
          () => pTimeout(yahooFinance.quote(yahooSymbol) as Promise<unknown>, { milliseconds: 6000 }),
          { retries: 2, minTimeout: 300, factor: 2, randomize: true,
            onFailedAttempt: (e) => this.logger.warn({ yahooSymbol, attempt: e.attemptNumber, err: e.message }, 'yahoo_retry') },
        ),
      );
      const parsed = YahooQuoteSchema.parse(raw);
      this.logger.info({ yahooSymbol, source: 'yahoo' }, 'quote_fetched');
      return { status: 'ok',
               data: { price: parsed.regularMarketPrice, asOf: new Date(parsed.regularMarketTime), currency: parsed.currency },
               source: 'yahoo-finance2', fetchedAt: new Date() };
    } catch (err) {
      if (err instanceof z.ZodError) {
        this.logger.error({ yahooSymbol, issues: err.issues }, 'yahoo_schema_validation_failed');
        return { status: 'err', reason: 'validation', message: err.message, source: 'yahoo-finance2' };
      }
      // Let opossum count the failure
      throw err;
    }
  }

  async getDailyHistory(yahooSymbol: string, from: Date, to: Date): Promise<ProviderResult<OHLCVBar[]>> {
    try {
      const raw = await this.limiter.schedule(() =>
        pTimeout(
          yahooFinance.historical(yahooSymbol, { period1: from, period2: to, interval: '1d' }) as Promise<unknown[]>,
          { milliseconds: 10_000 },
        ),
      );
      const bars = z.array(YahooOHLCBarSchema).parse(raw)
        .map((b) => ({
          ts: b.date, open: b.open, high: b.high, low: b.low,
          close: b.adjClose, rawClose: b.close, volume: b.volume,
        }));
      return { status: 'ok', data: bars, source: 'yahoo-finance2', fetchedAt: new Date() };
    } catch (err) {
      if (err instanceof z.ZodError) {
        this.logger.error({ yahooSymbol, issues: err.issues }, 'yahoo_history_validation_failed');
        return { status: 'err', reason: 'validation', message: err.message, source: 'yahoo-finance2' };
      }
      throw err;
    }
  }
}
```

### AMFI NAVAll.txt parser (pure function)

```typescript
// apps/api/src/data-ingestion/adapters/amfi/amfi.parser.ts
import { z } from 'zod';

const NavRowSchema = z.object({
  schemeCode: z.string().regex(/^\d+$/),
  isinGrowth: z.string().nullable(),
  isinReinvestment: z.string().nullable(),
  schemeName: z.string().min(1),
  nav: z.number().finite().positive(),
  date: z.string().regex(/^\d{2}-[A-Za-z]{3}-\d{4}$/),
});
export type AmfiNavRow = z.infer<typeof NavRowSchema>;

/**
 * Parses the AMFI NAVAll.txt body into validated rows.
 * - Skips header line, section banners (e.g., "Open Ended Schemes(Equity - Large Cap)"),
 *   AMC name lines, blank lines, and footer.
 * - Splits each data row on ';' into 6 fields.
 * - Validates each row with Zod; collects parse errors instead of throwing
 *   (one malformed row should not poison the whole nightly job — but rejected rows
 *    are counted and logged).
 */
export function parseAmfiNavAll(body: string): { rows: AmfiNavRow[]; rejected: number } {
  const lines = body.split(/\r?\n/);
  const rows: AmfiNavRow[] = [];
  let rejected = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    // Skip header
    if (line.startsWith('Scheme Code;')) continue;
    const parts = line.split(';');
    // Section banner / AMC name lines have <6 fields
    if (parts.length !== 6) continue;
    const [schemeCode, isinG, isinR, schemeName, navStr, dateStr] = parts.map((s) => s.trim());

    const parsed = NavRowSchema.safeParse({
      schemeCode,
      isinGrowth: isinG === '-' || isinG === '' ? null : isinG,
      isinReinvestment: isinR === '-' || isinR === '' ? null : isinR,
      schemeName,
      nav: Number(navStr),
      date: dateStr,
    });
    if (parsed.success) rows.push(parsed.data);
    else rejected++;
  }
  return { rows, rejected };
}
```

> Note the deliberate use of `safeParse` *inside* the line loop — at the row level we want to skip malformed rows (and count them) rather than abort the whole nightly file. This is a different boundary than the adapter level. The **file-fetch + total parse outcome** is still subject to a top-level integrity check: if `rows.length < expectedMin` (we know AMFI publishes ~10,000 schemes), the job fails loudly.

### BullMQ repeatable nightly AMFI job

```typescript
// apps/api/src/data-ingestion/jobs/nightly-amfi-nav.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import axios from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { parseAmfiNavAll } from '../adapters/amfi/amfi.parser';
import { FundRepository } from '../instrument-master/fund.repository';
import { NavHistoryRepository } from '../price-history/nav-history.repository';

const AMFI_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';

@Processor('nightly-amfi-nav')
export class NightlyAmfiNavProcessor extends WorkerHost {
  constructor(
    @InjectPinoLogger(NightlyAmfiNavProcessor.name) private readonly logger: PinoLogger,
    private readonly funds: FundRepository,
    private readonly navHistory: NavHistoryRepository,
  ) { super(); }

  async process(job: Job): Promise<void> {
    const correlationId = job.id;
    this.logger.info({ correlationId, jobName: job.name }, 'amfi_nav_job_start');

    const resp = await axios.get<string>(AMFI_URL, { timeout: 30_000, responseType: 'text' });
    const { rows, rejected } = parseAmfiNavAll(resp.data);

    if (rows.length < 8000) {
      throw new Error(`amfi_unexpected_low_count: got ${rows.length} rows`);
    }
    this.logger.info({ correlationId, accepted: rows.length, rejected }, 'amfi_nav_parsed');

    // Bulk upsert: instrument master + nav history
    await this.funds.bulkUpsertSchemes(rows);
    await this.navHistory.bulkInsertNav(rows);

    this.logger.info({ correlationId }, 'amfi_nav_job_done');
  }
}
```

Schedule it as a repeatable job in the module:

```typescript
// apps/api/src/data-ingestion/data-ingestion.module.ts (excerpt)
BullModule.registerQueue({ name: 'nightly-amfi-nav' });
// Then at bootstrap:
await this.amfiQueue.add('amfi-daily', {}, {
  repeat: { pattern: '30 23 * * *', tz: 'Asia/Kolkata' },  // 23:30 IST nightly
  removeOnComplete: 30,
  removeOnFail: 100,
});
```

### Cache TTL Policy

| Cache key pattern | TTL | Set on | Read on |
|-------------------|-----|--------|---------|
| `price:quote:{instrumentId}` | 15 min | every successful Yahoo/NSE quote fetch | report controller (Phase 4) + fallback stale-cache read |
| `price:history:{instrumentId}:{from}:{to}` | 24 h | every successful Yahoo history fetch | report chart endpoint + scoring |
| `fund:nav:latest:{schemeCode}` | 24 h | nightly AMFI / MFAPI ingest | report controller + fallback |
| `fund:nav:history:{schemeCode}` | 24 h | nightly ingest | report + scoring |
| `fundamentals:{instrumentId}` | 24 h | EOD Yahoo `quoteSummary` ingest | report + scoring |
| `news:item:{itemId}` | 7 days | RSS / NewsData poll | news feed render (Phase 6) |
| `news:list:{instrumentId}` | 30 min | RSS / NewsData poll | news feed |
| `instrument:lookup:{query}` | 1 h | search-autocomplete seed (Phase 5 uses Atlas Search but a warm cache short-circuits) | search endpoint |
| `breaker:state:{provider}` | (no TTL — managed by opossum, exposed via terminus) | n/a | health endpoint |

**Key naming rule:** `domain:resource:identifier[:variant]`. All keys carry a TTL (per project rule `data/redis-always-ttl`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `yahoo-finance` (original lib) | `yahoo-finance2@3` | 2020+ | Crumb handling, modular API, TypeScript, active maintenance — the only viable option. |
| `nse-india` / `nseindia` npm pkgs (various unmaintained) | `stock-nse-india@1.4.0` | 2023+ | Most other community NSE wrappers are abandoned; `stock-nse-india` is the most current as of 2026. |
| Hand-rolled retry/backoff with `setTimeout` | `p-retry` + `p-timeout` (Sindresorhus) | 2019+ | AbortSignal support, Promise-native, error-classification via `AbortError`. |
| Hystrix-port circuit breakers (`hystrix-js`, etc.) | `opossum` | 2017+ | Hystrix is dead; opossum is the only well-maintained Node breaker. |
| Bull v3 + `@nestjs/bull` | `bullmq@5` + `@nestjs/bullmq` | 2021+ | Bull v3 is legacy; BullMQ has better TS types, flows, repeatable jobs. **Already locked at project level.** |
| Joi for schema validation | Zod (or `@sinclair/typebox` for JSON-schema use) | 2022+ | Zod is the de-facto TS-first validator; better inference, smaller bundles. |
| TimescaleDB / regular Mongo collection for OHLC | **MongoDB time-series collections** (6.0+) | 2022+ | Native compression, bucket-optimised range scans. Project-level lock. |

**Deprecated/outdated:**
- `@google/generative-ai`: not in this phase, but flagged at project level.
- `text-embedding-004`: not in this phase.
- `@nestjs/bull` + `bull`: not in this phase.
- Holiday-calendar npm packages (most): all stale; bundle JSON instead.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Zod **4.x** is preferred over 3.x for new code | Standard Stack | LOW. Both work; 4.x is current major and recommended by Zod maintainers. If team prefers 3.x for stability, pin `^3.23` — refactor cost is small. |
| A2 | `opossum@9.0.0` is API-compatible enough with 8.x for the brief's "8.x" mention | Standard Stack | LOW. The `8 → 9` transition was minor; our use of `timeout`, `errorThresholdPercentage`, `resetTimeout`, and event listeners is unchanged. Verify with one tracer test in Wave 0. |
| A3 | No maintained NSE-holiday npm package exists in 2026 — bundle our own JSON | Don't Hand-Roll | LOW. Verify by searching npm once before scaffolding. Even if one exists, bundling a JSON is trivially the safer dependency. |
| A4 | yahoo-finance2 `adjClose` is fully correct for splits + dividends and only needs cross-check for verification | Pattern 5 | MEDIUM. Yahoo's adjustment is industry-standard but occasionally lags by 24h on Indian splits. The day-over-day ratio check + NSE corporate-actions cross-check is the safeguard. |
| A5 | MFAPI.in's stated "no rate limit" and "99.9% uptime" hold in practice | Standard Stack | MEDIUM. Self-stated metric, not contracted. Always have AMFI fallback active. |
| A6 | NSE bhav copy + BSE equity master + AMFI NAVAll are sufficient to seed the canonical instrument master with > 95% coverage of v1's target instruments | Pattern 4 + Sources | MEDIUM. Edge cases (recently listed, recently delisted, recently renamed) require monthly re-seed. Phase plan should include a monthly `instrument-master-seed` repeatable job. |
| A7 | MongoDB time-series collection update restrictions (MongoDB 6/7/8) don't block our adjustment-rewrite use case for splits | Pattern 5 | MEDIUM. As of MongoDB 5.0+ TS collections accept inserts; updates to non-meta fields require 6.0+ and have limitations. **Verify on the target Atlas tier** before locking the adjustment-rewrite strategy. If updates are too restricted, fall back to "drop + re-insert range" on detected splits. |
| A8 | `bottleneck` minTime values in the threshold table are reasonable starting points (4 conc, 250ms for Yahoo; 2 conc, 500ms for NSE) | Pattern 2 | MEDIUM. Educated guess from community reports of `yahoo-finance2` rate-limit thresholds. Wave 0 empirical probe is required before opening prod traffic. |
| A9 | The user-global rule `backend/no-console-log → @platform-core/logger` does **not** apply to this FinSight repo (different org) | Project Constraints | LOW. The rule is for a different codebase entirely; our project standard is `nestjs-pino`. Surfaced explicitly so the planner doesn't try to install a non-existent package. |
| A10 | Muhurat trading and AMFI's occasional Saturday publication on first-of-month require a special-case in the holiday JSON | Pitfall 4 | LOW. Verify on the NSE official calendar before generating the JSON. |

## Open Questions

1. **Are we allowed to deploy the AMFI nightly job to fetch from `portal.amfiindia.com` from an Atlas/AWS-Mumbai egress IP, or does AMFI block cloud egress?**
   - What we know: the URL serves plain HTTP-200 with a redirect chain (`amfiindia.com → portal.amfiindia.com`), `[VERIFIED: WebFetch 2026-05-28]`.
   - What's unclear: rate behavior under repeated automated requests from a cloud IP range.
   - Recommendation: empirically probe in Wave 0 from a staging egress IP. If blocked, route via an outbound proxy or AMFI's RSS-style endpoint (not a documented option — likely just need User-Agent variation).

2. **Should `dataVersionHash` (for downstream cache invalidation in Phase 4) live on the instrument doc, the latest price doc, or computed at read time?**
   - What we know: Phase 4 needs a cheap "did anything change?" signal per instrument.
   - What's unclear: which write trigger should bump it.
   - Recommendation: store `Instrument.dataVersionHash` and update it in the nightly fundamentals job + on every price-history append (cheap incremental sha1 over `[lastPriceTs, lastFundamentalsTs, lastNewsTs]`). Phase 4 reads it directly.

3. **Do we need NewsData.io at all in v1, or are MoneyControl + ET RSS sufficient?**
   - What we know: NewsData.io free tier is low-volume (200 credits/day on the lowest tier).
   - What's unclear: RSS coverage gaps for less-known stocks.
   - Recommendation: launch with RSS only; add NewsData.io as a feature flag in Phase 6 when coverage gaps become measurable. **Adapter stub is built now**, no key required.

4. **How do we handle a Yahoo crumb refresh failure when the `yahoo-finance2` lib doesn't auto-recover?**
   - What we know: `yahoo-finance2` handles crumb internally but the recovery isn't documented in detail.
   - What's unclear: whether a persistent 401 needs a process restart or just a `clearCache`.
   - Recommendation: wrap the lib's quote/historical calls in a "first 401 → invalidate any internal caches and retry once" recovery, *before* the circuit-breaker counts the failure. Verify behavior empirically in Wave 0.

5. **What's the planner's instruction for handling the gap between the brief's stated versions ("Zod 3.x", "opossum 8.x") and the current registry versions (Zod 4.4.3, opossum 9.0.0)?**
   - Recommendation: planner picks the current registry versions; the brief's versions were illustrative, not hard pins. Surface this in the plan's "Decisions Confirmed" section.

## Environment Availability

> Required for this phase (ingestion has many external dependencies and external services).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (>= 20) | All Node code | ✓ | v24.14.0 (`/Applications/Codex.app/Contents/Resources/node`) `[VERIFIED 2026-05-28]` | — |
| pnpm | Monorepo install | ✓ | 10.28.2 `[VERIFIED 2026-05-28]` | — |
| MongoDB (Atlas) | Persistence | n/a (cloud) | Atlas tier TBD (need M10+ for vector search later) | Local: docker compose mongo:7 with replica set |
| Redis server | Cache + BullMQ | ✓ (local) | 8.6.1 `[VERIFIED 2026-05-28]` | docker compose redis:7 |
| `mongod` / `mongosh` CLI | Local DB ops, debug | ✗ | — | Use Atlas web UI or Compass; or `brew install mongosh` |
| `docker` | Local containers (Redis, optional Mongo) | ✓ (aliased to `_lc docker` — present in path) | unknown (verify in Wave 0) | Direct local installs |
| Outbound HTTPS to `finance.yahoo.com` | Yahoo adapter | assumed ✓ (verify staging egress IP not blocked) | — | None — Yahoo is the primary stock source. NSE wrapper is the only fallback. |
| Outbound HTTPS to `nseindia.com` | NSE supplement | assumed ✓ (NSE blocks aggressively from cloud egress) | — | Treat as supplement only — Yahoo is primary. |
| Outbound HTTPS to `api.mfapi.in` | MFAPI primary | assumed ✓ | — | AMFI nightly file fallback. |
| Outbound HTTPS to `portal.amfiindia.com` | AMFI nightly NAVAll | `[VERIFIED: WebFetch 2026-05-28 — 200 OK after redirect from `amfiindia.com`]` | — | None for MF NAV authority — this is the source of truth. |
| Outbound HTTPS to `moneycontrol.com`, `economictimes.indiatimes.com` (RSS feeds) | News primary | assumed ✓ | — | NewsData.io |
| `NEWSDATA_IO_API_KEY` (env) | NewsData.io supplement | ✗ (not yet provisioned) | — | Skip NewsData enrichment; rely on RSS until key is provisioned. Adapter stub still built. |
| `MONGODB_URI` (env) | Mongo connection (from Phase 1) | assumed ✓ from Phase 1 | — | — |
| `REDIS_URL` (env) | Redis (from Phase 1) | assumed ✓ from Phase 1 | — | — |

**Missing dependencies with no fallback:**
- (none — every blocking dependency is either available or has a viable fallback)

**Missing dependencies with fallback:**
- `mongosh` CLI: use Compass / Atlas UI; install later if needed.
- `NEWSDATA_IO_API_KEY`: launch RSS-only; provision key before Phase 6 wiring.

**Wave 0 verification commands** (a planner step should include these):

```bash
# Outbound reachability + redirect handling
curl -sI -L https://api.mfapi.in/mf | head -3
curl -sI -L https://portal.amfiindia.com/spages/NAVAll.txt | head -3
curl -sI -L 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=RELIANCE.NS' | head -3
curl -sI -L https://www.moneycontrol.com/rss/marketreports.xml | head -3

# Yahoo crumb sanity (one real call)
node -e "import('yahoo-finance2').then(({default:yf}) => yf.quote('RELIANCE.NS').then(q => console.log(q.regularMarketPrice)))"
```

## Validation Architecture

> `workflow.nyquist_validation = true` in `.planning/config.json` — section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (NestJS default, `@nestjs/testing`); add ts-jest preset. Optional: Vitest if speed becomes an issue, but Nest's Jest integration is the path of least resistance. |
| Config file | `apps/api/jest.config.ts` (does not exist yet — Wave 0 task) |
| Quick run command (per task) | `pnpm --filter @finsight/api jest <pattern> -t '<testName>' --bail` |
| Full suite command (per wave) | `pnpm --filter @finsight/api test` (Jest with `--coverage` on phase gate) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| **DATA-01** | Looking up `RELIANCE` on NSE returns the same canonical instrument as `500325` on BSE and `RELIANCE.NS` on Yahoo | unit (repo) | `pnpm --filter @finsight/api jest instrument-master/lookup.service.spec` | ❌ Wave 0 |
| **DATA-01** | Fund lookup by `schemeCode` + plan + option returns exactly one document; (DIRECT, GROWTH) and (REGULAR, GROWTH) are distinct | unit (repo) | `pnpm --filter @finsight/api jest instrument-master/fund.repository.spec` | ❌ Wave 0 |
| **DATA-02** | `YahooAdapter` implements `PriceProvider` interface and returns `{ status: 'ok', source: 'yahoo-finance2', … }` envelope for a mocked successful quote | unit | `pnpm --filter @finsight/api jest adapters/yahoo/yahoo.adapter.spec` | ❌ Wave 0 |
| **DATA-02** | `MfapiAdapter` implements `FundProvider` for a mocked NAV response | unit | `pnpm --filter @finsight/api jest adapters/mfapi/mfapi.adapter.spec` | ❌ Wave 0 |
| **DATA-02** | `RssNewsAdapter` implements `NewsProvider` and dedupes items by guid | unit | `pnpm --filter @finsight/api jest adapters/rss-news/rss-news.adapter.spec` | ❌ Wave 0 |
| **DATA-02** | No file in `apps/api/src/{scoring,reports,…}/` imports `yahoo-finance2` directly | architecture (ESLint rule) | `pnpm --filter @finsight/api lint:arch` | ❌ Wave 0 (custom `no-restricted-imports` rule) |
| **DATA-03** | When Yahoo breaker is open and NSE returns ok, `getLatestQuote()` returns NSE result with `source: 'nse'` | integration (in-process, mocked HTTP) | `pnpm --filter @finsight/api jest chains/price-chain.spec` | ❌ Wave 0 |
| **DATA-03** | When all live providers fail and cache has a fresh-but-old entry, `getLatestQuote()` returns `{ status: 'stale', stalenessSeconds: >0 }` | integration | `pnpm --filter @finsight/api jest chains/price-chain.spec -t 'stale'` | ❌ Wave 0 |
| **DATA-03** | Per-provider circuit opens after the configured error % and short-circuits the next call within `rollingCountTimeout` | unit | `pnpm --filter @finsight/api jest circuit/breaker.factory.spec` | ❌ Wave 0 |
| **DATA-04** | A malformed Yahoo response (missing `regularMarketPrice`) returns `{ status: 'err', reason: 'validation' }` and **does not** write to Mongo | integration | `pnpm --filter @finsight/api jest adapters/yahoo/yahoo.adapter.spec -t 'validation'` | ❌ Wave 0 |
| **DATA-04** | An AMFI line with a non-numeric NAV is skipped, counted as `rejected`, and the rest of the file is processed | unit | `pnpm --filter @finsight/api jest adapters/amfi/amfi.parser.spec` | ❌ Wave 0 |
| **DATA-04** | An AMFI file with < 8000 rows fails the whole nightly job loudly | integration | `pnpm --filter @finsight/api jest jobs/nightly-amfi-nav.processor.spec -t 'low_count'` | ❌ Wave 0 |
| **DATA-05** | Persisted `close` equals upstream `adjClose` (snapshot test against a known split — e.g., MRF historical) | unit | `pnpm --filter @finsight/api jest price-history/adjustment.service.spec` | ❌ Wave 0 |
| **DATA-05** | A known 1:5 split shows continuous returns on the day-of-split (no >50% bar) after adjustment | unit (snapshot) | `pnpm --filter @finsight/api jest price-history/adjustment.service.spec -t 'split'` | ❌ Wave 0 |
| **DATA-05** | `MarketHolidayService.isTradingDay()` returns `false` for Saturday, Sunday, Republic Day 2026 (Jan 26), Diwali Laxmi Pujan 2026, and `true` for a known trading Tuesday | unit | `pnpm --filter @finsight/api jest calendar/market-holiday.service.spec` | ❌ Wave 0 |
| **DATA-05** | `isInTradingSession(now)` returns `true` for 10:30 IST on a trading day, `false` for 09:00 IST and for 16:00 IST | unit | `pnpm --filter @finsight/api jest calendar/market-holiday.service.spec -t 'session'` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @finsight/api jest <touched-module>/**.spec --bail` (sub-30s)
- **Per wave merge:** `pnpm --filter @finsight/api test` (full Jest suite)
- **Phase gate:** Full suite green + coverage report ≥ 80% on `apps/api/src/data-ingestion/**` before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/api/jest.config.ts` and `apps/api/test/setup.ts` (or extend the Phase 1 base config) — Wave 0 task
- [ ] Shared `tsconfig.spec.json` (Wave 0 task)
- [ ] ESLint custom rule (`no-restricted-imports` with patterns `yahoo-finance2`, `stock-nse-india`, etc.) restricted from outside `src/data-ingestion/**` — Wave 0 task
- [ ] Test fixtures: `tests/fixtures/yahoo-quote.json`, `tests/fixtures/amfi-navall-sample.txt`, `tests/fixtures/mfapi-scheme.json`, `tests/fixtures/rss-moneycontrol-sample.xml`, `tests/fixtures/nse-corporate-actions-sample.json` — Wave 0 task
- [ ] Mongo test container or `mongodb-memory-server` for repository tests — Wave 0 task (recommend `mongodb-memory-server` for speed, with TS-collection support requires version 8.0+ image)
- [ ] Optional: `nock` (HTTP interceptor) for `axios` mocking in adapter tests — Wave 0 install

## Security Domain

> Required (`security_enforcement` is not explicitly disabled in `.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | Auth is Phase 1; this phase exposes admin-only ingestion trigger endpoints — they MUST sit behind the existing JWT guard. No new auth surface. |
| V3 Session Management | no | No sessions handled in this phase. |
| V4 Access Control | yes | Admin ingestion trigger endpoints (e.g., `POST /admin/data-ingestion/reseed-instruments`) require role-based check via a Nest guard (`@Roles('admin')`). No public ingestion endpoints. |
| V5 Input Validation | yes | **Zod** at every external provider boundary; **class-validator** DTOs on admin endpoints. Two distinct boundaries, two validation tools — by design. |
| V6 Cryptography | partial | Provider API keys (e.g., `NEWSDATA_IO_API_KEY`) stored in secret manager (project rule). No custom crypto. |
| V7 Error Handling | yes | Adapter errors return the typed `Err` envelope; never leak provider URLs / keys / stack traces to clients (admin endpoints filter to a structured error code only). |
| V8 Data Protection | yes | Cache keys do NOT contain PII (instrument data is not PII). Logs never contain a user identifier — ingestion is anonymous batch work. |
| V9 Communication | yes | All outbound HTTPS only; verify TLS not disabled on `axios`. |
| V12 Files & Resources | yes | AMFI NAVAll is a downloaded text file — parse in-memory only, never write to a tmp file outside a controlled directory. |
| V14 Configuration | yes | All upstream URLs (`AMFI_URL`, `MFAPI_URL`, RSS feeds) configurable via env, not hard-coded for prod-vs-dev split. |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via user-supplied URL passed to RSS parser | Tampering | News feed URLs are **server-config only**; no user input flows into `rss-parser`. |
| API-key leakage in logs (NewsData) | Information disclosure | `pino` `redact` config drops `Authorization`, `apiKey`, `x-api-key` headers + any `?apikey=…` query param. |
| Cache poisoning via malformed upstream payload | Tampering | Zod `parse()` at the boundary — invalid shape is never written to Redis or Mongo. |
| Cache key collision (e.g., user-supplied schemeCode injecting `:`) | Tampering | Validate `schemeCode` (`/^\d+$/`) before using in key. |
| Resource exhaustion via runaway concurrency to free upstreams (gets us IP-blocked) | DoS (self) | `bottleneck` per-provider concurrency cap; `opossum` circuit breaker. |
| Logging PII | Information disclosure | This phase logs upstream URLs, instrument symbols, and latencies — none is PII. Explicit project rule prohibits user identifiers in this phase's logs. |
| Path traversal when bundling holiday JSON | Tampering | JSON files loaded from `__dirname` relative path, never from a user-supplied path. |
| Outbound to malicious lookalike host | Spoofing | Upstream URLs hard-coded constants checked against `https://` scheme + known host allowlist on cold start. |

### Sources for Instrument Master Seed

| Source | URL / Format | Use | Confidence |
|--------|--------------|-----|------------|
| NSE Bhav Copy (EOD equities) | `https://archives.nseindia.com/content/historical/EQUITIES/{YYYY}/{MMM}/cm{DDMMYYYY}bhav.csv.zip` | Daily list of NSE-listed symbols, ISINs, names | `[CITED: NSE archives convention, MEDIUM — verify URL pattern still resolves on Wave 0]` |
| BSE Equity Master | `https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active` | BSE codes + ISIN + company name | `[ASSUMED — undocumented BSE endpoint; verify in Wave 0, fall back to manual CSV]` |
| AMFI NAVAll.txt | `https://portal.amfiindia.com/spages/NAVAll.txt` | All MF scheme codes + ISINs + names (full universe nightly) | `[VERIFIED: WebFetch 2026-05-28 — 200 OK, semicolon-delimited]` |
| ISIN master | derived from above (NSE/BSE/AMFI all expose ISIN) | Unique cross-source key | `[CITED: SEBI ISIN registry]` |

## Sources

### Primary (HIGH confidence)
- npm registry (live query, 2026-05-28) — version verification for all packages listed in Standard Stack (`yahoo-finance2 3.14.1`, `stock-nse-india 1.4.0`, `rss-parser 3.13.0`, `zod 4.4.3`, `opossum 9.0.0`, `p-retry 8.0.0`, `p-timeout 7.0.1`, `bottleneck 2.19.5`, `ioredis 5.11.0`, `nestjs-pino 4.6.1`, `pino 10.3.1`, `@nestjs/schedule 6.1.3`, `@nestjs/terminus 11.1.1`, `luxon 3.7.2`, `axios 1.16.1`, `nanoid 5.1.11`, `@nestjs/throttler 6.5.0`)
- `https://www.mfapi.in/` (WebFetch 2026-05-28) — confirmed base URL `api.mfapi.in`, no auth, no rate limit, 6× daily refresh
- `https://portal.amfiindia.com/spages/NAVAll.txt` (WebFetch 2026-05-28) — confirmed semicolon delimiter, 6-column layout, `DD-MMM-YYYY` date
- `https://github.com/gadicc/node-yahoo-finance2` (WebFetch 2026-05-28) — confirmed v3 module list and unofficial-API caveat
- `.planning/research/STACK.md` — verified package versions and Indian-market wrapper guidance (project source of truth)
- `.planning/research/PITFALLS.md` — corporate-action, scheme-code, market-hours, free-data fragility guidance
- `.planning/research/SUMMARY.md` — overall data-ingestion architecture context
- MongoDB official docs — time-series collections schema (`timeField`, `metaField`, `granularity`)
- `nestjs.com/techniques/queues` — BullMQ + repeatable jobs
- `nodeshift.dev/opossum` — opossum circuit breaker API

### Secondary (MEDIUM confidence)
- Community reports (GitHub issues on `yahoo-finance2`, `stock-nse-india`) — empirical rate-limit thresholds (4 conc / 250ms for Yahoo; 2 conc / 500ms for NSE) — needs Wave 0 verification
- MFAPI.in self-stated SLA — needs operational corroboration
- NSE corporate-actions endpoint via `stock-nse-india` wrapper — schema not contractually stable

### Tertiary (LOW confidence)
- BSE equity master endpoint URL — undocumented BSE API; flagged for Wave 0 verification
- NSE bhav copy URL pattern — historically stable but NSE archive URLs occasionally change

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version live-verified on npm 2026-05-28; pattern guidance traceable to STACK.md + official docs.
- Architecture (port + chain + breaker + Zod + TS collection): HIGH — well-established Node patterns, project-aligned.
- Pitfalls: HIGH on Indian-market quirks + free-data fragility (multi-source corroboration in PITFALLS.md); MEDIUM on exact opossum/bottleneck thresholds (empirical Wave 0 tuning required).
- Environment: HIGH for Node/pnpm/Redis (locally verified); MEDIUM for cloud-egress reachability to Yahoo/NSE/AMFI (must be probed in Wave 0 staging).

**Research date:** 2026-05-28
**Valid until:** 2026-06-27 (30 days) — re-verify provider URLs and yahoo-finance2 version before Phase 6 (news) if not started by then.
