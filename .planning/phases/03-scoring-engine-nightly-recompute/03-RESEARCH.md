# Phase 3: Scoring Engine & Nightly Recompute — Research

**Researched:** 2026-05-28
**Domain:** Deterministic numeric scoring + BullMQ batch orchestration on NestJS 11 / MongoDB Atlas time-series / Redis 7
**Confidence:** HIGH on stack + architecture + pitfalls (verified upstream in SUMMARY.md and PITFALLS.md, plus live npm registry checks 2026-05-28). MEDIUM on the recommended sub-formulas — they are an engineering judgement informed by Tickertape Scorecard and Trendlyne DVM patterns and must be confirmed by the user (see Assumptions Log).

## Summary

This phase builds the **core IP**: two pure functions — `scoreStock(input)` and `scoreFund(input)` — that turn validated point-in-time data into a deterministic 1–10 score with a full pillar breakdown, plus a BullMQ EOD job that fans out across the universe (~5k stocks + ~14k funds), writes per-instrument scores into a MongoDB time-series `score_history` collection, and is fully idempotent on `${instrumentId}:${asOfDate}`.

The PRD locked the pillar **weights** but left **sub-factor selection, normalisation, peer-cohort definition, and NAV-timing semantics** unspecified. This document closes that gap with a prescriptive, Tickertape-style recipe: per-pillar sub-factors are each normalised to `[0,10]` via **percentile rank within the instrument's peer cohort** (sector × market-cap bucket) with absolute-band fallback when cohorts are too small, then composed by weight. Decimal arithmetic uses `decimal.js` and a fixed rounding policy so the same inputs reproduce the same score across Node versions and CPU architectures.

The Sentiment pillar emits a **neutral fallback of 5.0** when news data is absent (pre-Phase 6), so the EOD job can run from day one without violating the determinism contract. The function signature does not change once Phase 6 wires real sentiment in — only the input field flips from `null` to a real `SentimentInput`.

**Primary recommendation:** Build the engine as a single pure module (`packages/scoring` or `apps/api/src/scoring/`) with zero NestJS, Mongo, or Redis imports. Orchestration (`StocksModule`, `FundsModule`, `JobsModule`) wraps it. TDD with Vitest snapshot fixtures + `fast-check` property tests gives the determinism guarantee teeth.

## User Constraints (from upstream + locked decisions in prompt)

> No CONTEXT.md exists for this phase yet (discuss step not run). Constraints below are extracted from the **locked decisions** block in the spawn prompt and from upstream PROJECT.md / SUMMARY.md / PITFALLS.md. Treat as authoritative for planning.

### Locked Decisions
- **Stack:** NestJS 11 + MongoDB Atlas (ap-south-1) time-series collections + BullMQ 5.77 + Redis 7 + `@nestjs/bullmq 11`.
- **Purity:** `ScoringModule` MUST be pure functions — zero I/O, zero NestJS imports inside the scoring core. Orchestration lives in `StocksModule` and `FundsModule`.
- **Stock pillar weights (immutable):** Fundamentals 35 / Valuation 20 / Technical 20 / Sentiment 10 / Risk 10 / Event 5 (sum = 100).
- **MF pillar weights (immutable):** Returns 35 / Risk-adjusted 25 / Consistency 15 / Costs 10 / Manager 10 / Portfolio 5 (sum = 100).
- **Verdict bands (immutable, compliance-driven):**
  - 8.5 – 10.0 → `STRONG_SCORE`
  - 5.0 – 8.4 → `CAUTION` (absorbs PRD §10.2 "BUY" 7.0–8.4 + "HOLD" 5.0–6.9)
  - 0.0 – 4.9 → `WEAK_SCORE` (absorbs PRD §10.2 "REDUCE" 3.0–4.9 + "SELL" 0–2.9)
  - The PRD's BUY / SELL / HOLD / REDUCE verbs are **forbidden** by COMP-01. Do not reintroduce them anywhere — code, prompts, SEO copy, comments.
- **Sentiment pillar fallback:** Must emit a graceful neutral value when news data is unavailable (pre-Phase 6), so SCORE-01 holds before SCORE-04 has any sentiment input.

### Claude's Discretion (within the lock)
- Per-pillar sub-factor algorithms (normalisation, weighting, peer-cohort definition).
- Decimal-precision strategy.
- Snapshot-test fixture shape, property-test invariants.
- BullMQ chunking / concurrency / repeat-cron config.
- Time-series collection granularity choice.

### Deferred (OUT OF SCOPE for this phase)
- Sentiment-pillar real data wiring (Phase 6).
- Watchlist-refresh job consumer (Phase 5).
- Narrative-batch job (Phase 4).
- Live Gemini calls of any kind (entire phase is deterministic compute).
- User-facing report UI (Phase 4).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCORE-01 | Pure (zero-I/O) function computes deterministic 1–10 stock score from 6 weighted pillars | "Pillar Sub-Formulas — Recommended" (Stocks) + "Architecture Patterns" (pure core + imperative shell) |
| SCORE-02 | Pure function computes deterministic 1–10 fund score from parallel framework | "Pillar Sub-Formulas — Recommended" (Mutual Funds) |
| SCORE-03 | Each score exposes full pillar/sub-factor breakdown for explainability | `ScoreResult` shape in "Code Examples"; every pillar returns its inputs + normalised values + weighted contribution |
| SCORE-04 | Nightly BullMQ job recomputes scores for all tracked instruments and writes time-stamped history | "Score History & EOD Job" (time-series collection design + fan-out + idempotency key + repeatable cron) |
| SCORE-05 | Identical inputs → identical scores (determinism tests) | "Numerical Pipeline & Determinism" (decimal.js + HALF_UP rounding) + "Test Strategy" (snapshot + fast-check) |

## Standard Stack

### Core
| Library | Version (verified npm 2026-05-28) | Purpose | Why Standard |
|---------|--------------------------------|---------|--------------|
| `@nestjs/common` | `11.1.24` | Module / DI scaffolding for orchestration layer | Locked stack [VERIFIED: npm view] |
| `@nestjs/bullmq` | `11.0.4` | BullMQ + NestJS DI bridge (Processor / Queue decorators) | Official NestJS integration; matches BullMQ 5.x [VERIFIED: npm view] |
| `bullmq` | `5.77.6` | Job queue, repeatable jobs, parent/child flows, idempotency | Industry-standard Node queue, Redis-backed [VERIFIED: npm view] |
| `ioredis` | `5.11.0` | Redis client BullMQ depends on | BullMQ-required client; same connection used by CacheModule [VERIFIED: npm view] |
| `mongoose` | `9.6.3` | ODM for `score_history` and instrument reads | Locked stack [VERIFIED: npm view] |
| `decimal.js` | `10.6.0` | Arbitrary-precision decimal arithmetic | Eliminates IEEE-754 drift across CPUs/Node versions [VERIFIED: npm view] |
| `class-validator` | `0.15.1` | DTO validation on score-request endpoints (single-instrument recompute API) | Project-standard validator [VERIFIED: npm view] |
| `vitest` | `4.1.7` | Test runner — snapshot + describe.each + fixtures | Fast, ESM-native, used elsewhere in monorepo [VERIFIED: npm view] |
| `fast-check` | `4.8.0` | Property-based tests — score bounds, monotonicity | De-facto JS property-testing lib [VERIFIED: npm view] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | `4.3.0` | Day arithmetic, NSE/BSE trading-day calendar math | Use everywhere a date is rolled forward/back; pure & tree-shakable [VERIFIED: npm view] |
| `date-fns-tz` | `3.2.0` | IST timezone-correct `asOfDate` computation | All `asOfDate` math runs in `Asia/Kolkata` and persists as UTC ISO [VERIFIED: npm view] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `decimal.js` | `big.js` (`7.0.1`) | `big.js` is smaller and faster, but `decimal.js` has wider precision API and better-documented rounding modes. Either is fine; `decimal.js` chosen for richer rounding-mode coverage. [VERIFIED: npm view big.js version → 7.0.1] |
| `vitest` | `jest 30.4.2` | Jest is the NestJS-CLI default. Vitest is faster, ESM-first, identical API. Either works — defer to monorepo convention chosen in Phase 1 (`apps/api`). Document chosen tool in TASK file. [VERIFIED: npm view] |
| MongoDB time-series collection | Regular collection with `{instrumentId, computedAt}` compound index | TS collection is purpose-built for append-only time-indexed data; better compression and query plan for "give me last N scores for this instrument". Use TS. |
| BullMQ FlowProducer (parent → children) | Plain `Queue.addBulk()` | FlowProducer is required when you want a parent job that waits on children. Here we don't need waits — fan-out + per-child idempotency is enough. Use `addBulk()` with chunked enqueue. |

**Installation:**
```bash
pnpm add bullmq @nestjs/bullmq ioredis decimal.js date-fns date-fns-tz
pnpm add -D vitest fast-check
```

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
├── scoring/                       # PURE — zero I/O, zero NestJS
│   ├── stock/
│   │   ├── pillars/
│   │   │   ├── fundamentals.ts    # scoreFundamentalsPillar(input) → PillarBreakdown
│   │   │   ├── valuation.ts
│   │   │   ├── technical.ts
│   │   │   ├── sentiment.ts       # graceful neutral fallback when input.sentiment == null
│   │   │   ├── risk.ts
│   │   │   └── event.ts
│   │   ├── normalise.ts           # percentile-rank + absolute-band helpers
│   │   ├── decimal.ts             # decimal.js config (precision, rounding mode)
│   │   ├── compose.ts             # weighted sum → 1–10 with verdict band
│   │   └── score-stock.ts         # top-level scoreStock(input)
│   ├── fund/
│   │   └── (parallel structure)
│   ├── types.ts                   # ScoreInput, ScoreResult, PillarBreakdown
│   └── index.ts                   # exports scoreStock, scoreFund
├── stocks/                         # IMPERATIVE SHELL — fetches data, calls scoring/, persists
│   ├── stocks.service.ts          # loadScoreInput(instrumentId, asOfDate) → ScoreInput
│   └── stocks.module.ts
├── funds/
│   └── ...
└── jobs/
    ├── eod-recompute/
    │   ├── eod-recompute.processor.ts   # BullMQ @Processor — handles one instrument
    │   ├── eod-recompute.producer.ts    # enqueues children, owns repeatable cron
    │   ├── score-history.schema.ts      # Mongoose schema for TS collection
    │   └── eod-recompute.module.ts
    └── jobs.module.ts
```

**Hard rule (enforced by ESLint or by code review):** anything imported by `scoring/` must be pure. No `@nestjs/*`, no `mongoose`, no `ioredis`, no `bullmq`, no `fetch`, no `Date.now()` inside the scoring core. Time, RNG (if ever needed), and data are injected.

### Pattern 1: Pure Core + Imperative Shell (Functional Core, Imperative Shell)
**What:** All deterministic scoring logic lives in functions of type `(ScoreInput) → ScoreResult`. The NestJS modules around it are responsible for I/O — loading the data, calling the function, persisting the result.

**When to use:** Always — non-negotiable for SCORE-01, SCORE-02, SCORE-05.

**Why it matters:** Test determinism by importing the pure function and feeding fixtures. No Mongo, no Redis, no clock, no provider stubs needed for the determinism contract.

**Example:** see "Code Examples — `scoreStock`" below.

### Pattern 2: BullMQ Fan-Out with Idempotent Children
**What:** A single repeatable parent job (cron: `0 18 * * *` IST = `0 12 * * *` UTC) loads the active universe from Mongo, chunks into batches of 100 instrument IDs, and `queue.addBulk()` enqueues one child job per instrument. Each child job is idempotent on `jobId = ${instrumentId}:${asOfDate}` — BullMQ refuses duplicate jobIds, so re-running the parent on the same `asOfDate` is safe.

**When to use:** The nightly recompute (SCORE-04) and any future per-universe batch (narrative-batch in Phase 4 should follow the same pattern).

**Why this not FlowProducer:** Parent does not need to wait on children. A failed child should retry independently; a failed parent should re-enqueue only the missing children. The simpler `addBulk` + per-child `jobId` gives that for free.

**Concurrency:** Start with `concurrency: 10` per worker process; tune up after measuring CPU and Mongo write load. Mongo TS collection writes are append-only and parallel-safe.

**Retry policy:** `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`. Failures after 3 attempts land in the BullMQ DLQ (`failed` set) for manual inspection.

### Pattern 3: Point-in-Time `ScoreInput` Loader
**What:** The shell layer (`StocksService.loadScoreInput(instrumentId, asOfDate)`) is responsible for assembling a `ScoreInput` that reflects only data **known as of `asOfDate`**: prices up to and including `asOfDate`, fundamentals from the most recent filing whose report date `≤ asOfDate`, peer cohort as it existed on `asOfDate`, etc. This is the only place point-in-time discipline is enforced. The scoring core trusts its input.

**Why it matters:** Survivorship bias (PITFALLS.md #5) is introduced at *data load time*, not at scoring time. If the shell loads today's listed peers, every historical recompute is biased. Codify "snapshot the peer universe on the asOfDate" as a contract on this loader.

### Anti-Patterns to Avoid
- **Importing Mongoose models inside `scoring/`** — kills determinism and testability. If you see `import { ScoreHistoryModel } from '../../jobs'` inside `scoring/` in a PR, reject it.
- **Computing `Date.now()` inside the pillars** — pass `asOfDate` and `priceHistory` in; never read the wall clock.
- **Using `Number` for ratios** — floating-point drift across CPUs causes flaky snapshot tests. Use `decimal.js` for any divide, multiply, or compounding chain.
- **Letting a single child failure block the cron** — the parent must continue on per-instrument errors and log them; only persistent global failures should page.
- **Re-using `jobId = instrumentId` (without `asOfDate`)** — would silently suppress recomputes on future days. Always include `asOfDate`.
- **Running the cron without a global lock** — if two API replicas both schedule the repeatable, BullMQ's repeatable-job machinery already deduplicates via the repeat key, but verify by confirming only one parent job appears per day.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron / repeatable scheduling | A `setInterval()` in `onModuleInit()` | BullMQ repeatable jobs via `Queue.upsertJobScheduler()` (BullMQ 5.x replaces deprecated `add(..., { repeat: ... })`) | Survives restarts, dedups across replicas, persists schedule in Redis |
| Job retry / backoff / DLQ | Custom try/catch loop with sleeps | BullMQ `attempts` + `backoff: 'exponential'` + `failed` set | Battle-tested; observable via BullBoard |
| Peer-cohort selection (sector × market-cap) | Per-pillar inline `instruments.find()` | A single `PeerCohortService.snapshot(instrument, asOfDate)` that the shell calls once and passes into the scoring core | One place to enforce survivorship-safe selection; one place to test |
| Decimal arithmetic | Hand-rolled toFixed/rounding | `decimal.js` with `Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })` once at module load | IEEE-754 drift causes flaky snapshot tests in CI |
| Percentile-rank computation | A custom `array.sort()` loop in each pillar | A single `normalise.percentileRank(value, peerValues, direction)` helper in `scoring/stock/normalise.ts` | Six pillars × multiple sub-factors each = 30+ call sites — one helper, one set of edge cases |
| Time-series storage | A regular collection + manual TTL | MongoDB time-series collection (`timeseries: { timeField, metaField, granularity }`) | Purpose-built compression, optimised range queries, no extra indexes needed for `metaField + timeField DESC` lookups |
| Trading-day / holiday calendar | Hardcoded weekend skip | NSE/BSE holiday calendar shipped by `DataIngestionModule` (Phase 2 deliverable) — scoring core takes a `tradingDay(date) → boolean` injected helper | Indian market has 14–17 trading holidays per year + muhurat trading; getting this wrong corrupts every momentum and volatility score |
| RSI / MACD / Bollinger primitives | Numerical-recipes copy-paste | The price-history shape Phase 2 emits is post-corporate-action-adjusted. Compute RSI/MACD inline (formulas are stable & well-known) but isolate them in `scoring/stock/indicators.ts` with snapshot tests against known references (e.g. TA-Lib outputs) | Common Indian-market gotcha: adjusted vs unadjusted gives wildly different MACD. We assume DATA-05 guarantees adjusted series. |

**Key insight:** The scoring engine is small (a few hundred lines per asset class). The temptation is to inline everything. Resist — every duplicated helper is a place determinism can drift. Centralise normalisation, decimal math, and peer-cohort selection.

## Pillar Sub-Formulas — Recommended

> **Reading guide.** Each pillar produces a `PillarBreakdown { pillarScore: 0..10, weight: 0..1, weightedContribution: pillarScore * weight, subFactors: SubFactorBreakdown[] }`. Each sub-factor produces a `SubFactorBreakdown { name, rawValue, normalisedScore: 0..10, weightWithinPillar, source, isFallback }`. The pillar score is the weighted average of its sub-factor normalised scores. The final score is `Σ pillar.weightedContribution`, clamped to `[0, 10]`, rounded HALF_UP to 1 decimal place.

> **Normalisation policy (uniform across pillars).** For each sub-factor:
> 1. Build the peer-cohort value vector for the same sub-factor (NSE sector × market-cap bucket, point-in-time).
> 2. If `peerCohort.length >= 20`: `normalisedScore = percentileRank(value, peerCohort, direction) * 10 / 100`, where `direction` is `'higher-is-better'` or `'lower-is-better'` per the metric. Tie-breaking: average rank.
> 3. If `peerCohort.length < 20`: fall back to **absolute bands** defined per metric (see tables below). Mark `isFallback: true` in the breakdown so SCORE-03 explainability surfaces it.
> 4. Missing input: omit the sub-factor and **redistribute its within-pillar weight pro-rata across present sub-factors**. Mark `isImputed: false, isAbsent: true`. If *all* sub-factors of a pillar are absent, the pillar emits `pillarScore: 5.0` with `isFallback: true`.
> 5. Pillar score is clamped to `[0, 10]` and rounded HALF_UP to 4 dp before composition.

> **Peer cohort definition.** `cohort = instruments.filter(i => i.sector == target.sector && i.marketCapBucket == target.marketCapBucket && i.listedAsOf <= asOfDate && (i.delistedAsOf == null || i.delistedAsOf > asOfDate))`. Market-cap buckets: Large > ₹50,000 cr / Mid ₹15,000–50,000 cr / Small ₹5,000–15,000 cr / Micro < ₹5,000 cr. These bands match standard Indian retail-research segmentation [ASSUMED — confirm with user before locking].

### Stock — Pillar 1: Fundamentals (35%)

Eight sub-factors, equal weighting within pillar unless noted (so `weightWithinPillar = 1/8 = 0.125` each).

| Sub-factor | Direction | Source field (Phase 2) | Absolute-band fallback (when cohort < 20) |
|---|---|---|---|
| ROE (TTM) | higher | `fundamentals.roeTtm` | `<5% → 0`, `5–15% → 5`, `15–25% → 8`, `>25% → 10` |
| ROCE (TTM) | higher | `fundamentals.roceTtm` | `<8% → 0`, `8–15% → 5`, `15–25% → 8`, `>25% → 10` |
| Debt / Equity | lower | `fundamentals.debtToEquity` | `>2 → 0`, `1–2 → 4`, `0.5–1 → 7`, `<0.5 → 10` |
| Revenue Growth (3Y CAGR) | higher | `fundamentals.revenueCagr3y` | `<5% → 2`, `5–10% → 5`, `10–20% → 8`, `>20% → 10` |
| Profit Growth (3Y CAGR) | higher | `fundamentals.profitCagr3y` | `<5% → 2`, `5–15% → 5`, `15–25% → 8`, `>25% → 10` |
| Operating Margin (TTM) | higher | `fundamentals.opMarginTtm` | sector-relative even in fallback (margins are intrinsically sector-dependent); use absolute only as last resort: `<5% → 3`, `5–15% → 6`, `>15% → 9` |
| Promoter Holding | higher (within bounds) | `shareholding.promoterPct` | `<25% → 3`, `25–50% → 6`, `50–75% → 9`, `>75% → 7` (very-high promoter holding is a yellow flag for liquidity/free-float) |
| Pledged Shares (% of promoter holding) | lower | `shareholding.pledgedPctOfPromoter` | `0% → 10`, `0–10% → 7`, `10–25% → 3`, `>25% → 0` |

**Why these defaults:** match the Tickertape Scorecard "Fundamental Score" pattern (percentile rank within sector for the same factor list) [CITED: tickertape.in/blog/introducing-scorecard…, help.tickertape.in/support/solutions/articles/82000142926-fundamental-score] and Trendlyne Durability pillar [CITED: trendlyne.com/score-details/].

### Stock — Pillar 2: Valuation (20%)

Six sub-factors, equal weighting (`1/6` each).

| Sub-factor | Direction | Source field | Absolute-band fallback |
|---|---|---|---|
| P/E (TTM) vs sector median | **percentile rank only** (no absolute band — P/E is meaningless cross-sector) | `valuation.peTtm` + `sectorMedians.pe` | If cohort < 20, fallback to `pillarScore = 5.0` (neutral) and `isFallback: true` |
| P/B | lower | `valuation.pb` | `<1 → 9`, `1–3 → 7`, `3–6 → 5`, `>6 → 2` |
| PEG | lower | `valuation.peg` | `<1 → 9`, `1–2 → 6`, `2–3 → 3`, `>3 → 0` |
| EV/EBITDA | lower | `valuation.evEbitda` | `<8 → 9`, `8–15 → 6`, `15–25 → 4`, `>25 → 1` |
| Dividend Yield | higher (small bonus) | `valuation.divYield` | `0% → 5`, `0–2% → 6`, `2–4% → 8`, `>4% → 10` |
| DCF-implied premium/discount | **OPTIONAL** — omit in v1 (requires DCF engine) | — | Omit; redistribute weight to other 5 sub-factors |

**Recommendation:** Drop DCF for v1 and renormalise the remaining 5 sub-factors to `0.20` each. This keeps the pillar fully deterministic from free data and avoids building a DCF subsystem this phase. `[ASSUMED]`

### Stock — Pillar 3: Technical / Momentum (20%)

Seven sub-factors, weighting:

| Sub-factor | Weight in pillar | Direction | Formula / source |
|---|---|---|---|
| Price vs 50 DMA | 0.15 | higher | `(price - sma50) / sma50` — peer percentile or band `<-5% → 2 / -5–0% → 5 / 0–5% → 7 / >5% → 9` |
| Price vs 200 DMA | 0.20 | higher | same shape vs `sma200` |
| RSI (14) | 0.15 | "closer to 50" | Convert to score: `50 → 10`, `30 or 70 → 5`, `<20 or >80 → 0` (triangular). Both extremes are punished. |
| MACD signal | 0.10 | crossover-state | `macd > signal AND macd > 0 → 10`, `macd > signal AND macd < 0 → 7`, `macd < signal AND macd > 0 → 5`, `macd < signal AND macd < 0 → 2` |
| Bollinger position | 0.10 | mean-revert | `(price - lowerBand) / (upperBand - lowerBand)` → `0.4–0.6 → 10`, `0.2–0.8 → 7`, else `3` |
| 1Y return vs Nifty 50 | 0.15 | higher | percentile rank of `(stockReturn1y - niftyReturn1y)` within cohort |
| 3Y return vs Nifty 50 | 0.15 | higher | same, 3Y |
| Beta (informational, drags score if very high) | weight 0 (reported only — does not affect pillar score) | — | Surface in breakdown for explainability; Beta belongs in Risk pillar narrative, not Technical math |

**Smoothing windows are fixed by definition:** SMA-50, SMA-200, RSI-14, MACD-(12,26,9), Bollinger-(20, 2σ). These are industry-standard parameters; do not parameterise.

### Stock — Pillar 4: Sentiment / News (10%)

| Sub-factor | Weight in pillar | Source |
|---|---|---|
| Aggregated AI sentiment score over last 30 days (Positive/Neutral/Negative count → 0–10 scaled) | 0.70 | `sentiment.last30dAggregate` (populated by Phase 6) |
| Analyst rating consensus (optional, may be absent v1) | 0.30 | `sentiment.analystConsensus` (likely absent in v1; omit + renormalise) |
| Social mentions trend | weight 0 (deferred) | — |

**Graceful neutral fallback (REQUIRED for SCORE-01 to pass before Phase 6):**

```typescript
function scoreSentimentPillar(input: SentimentInput | null): PillarBreakdown {
  if (input == null || input.last30dAggregate == null) {
    return {
      pillarScore: new Decimal(5.0),
      weight: new Decimal(0.10),
      weightedContribution: new Decimal(0.5),
      subFactors: [],
      isFallback: true,
      fallbackReason: 'NO_SENTIMENT_DATA_PRE_PHASE_6',
    };
  }
  // ...normal computation
}
```

The contract is: **same function signature** before and after Phase 6 wiring. The shell flips `input.sentiment` from `null` to a real `SentimentInput`. No scoring-core changes.

### Stock — Pillar 5: Risk / Quality (10%)

Five sub-factors, weighting:

| Sub-factor | Weight | Direction | Source |
|---|---|---|---|
| Volatility — 1Y stddev of daily log returns, annualised | 0.30 | lower | computed from `priceHistory[asOfDate-365d..asOfDate]` |
| Max drawdown (1Y) | 0.20 | lower | computed inline; band `<10% → 10 / 10–25% → 7 / 25–40% → 4 / >40% → 0` |
| Earnings consistency — % of last 12 quarters with positive net profit | 0.25 | higher | `quarterlyResults` count |
| Audit / governance flags | 0.15 | lower | `governance.auditQualifications` count → `0 → 10 / 1 → 5 / >1 → 0` |
| Promoter pledge trend (90-day delta) | 0.10 | lower | `shareholding.pledgedPctTrend90d` |

### Stock — Pillar 6: Event Sensitivity (5%)

Lowest weight; intentionally coarse in v1.

| Sub-factor | Weight | Source |
|---|---|---|
| Mean absolute return on the 5 most recent results days | 0.50 | `priceHistory` + `events.resultsDates` |
| Mean absolute return on the 5 most recent dividend declaration days | 0.30 | `events.dividendDates` |
| Mean absolute return on the 5 most recent sector-news-tagged days | 0.20 | `events.sectorNewsDates` (may be absent v1 → omit + renormalise) |

**Scoring direction:** the *score* increases as event-sensitivity *decreases* — i.e. a stable stock that does not whipsaw on every result print earns a higher Event Sensitivity score. Map `meanAbsReturn` to band `<1% → 10 / 1–3% → 7 / 3–5% → 4 / >5% → 0`.

### Fund — Pillar 1: Returns (35%)

| Sub-factor | Weight | Direction | Source |
|---|---|---|---|
| 3Y rolling return — fund vs category median | 0.30 | higher | `(fundCagr3y - categoryMedianCagr3y)` → percentile rank within category |
| 3Y rolling return — fund vs benchmark TRI | 0.20 | higher | same vs `benchmarkTriCagr3y` |
| 5Y rolling return — fund vs category median | 0.30 | higher | analogous |
| 5Y rolling return — fund vs benchmark TRI | 0.20 | higher | analogous |

**Total-Return Index (TRI) discipline:** compare against benchmark **TRI**, not price index, otherwise dividends-reinvested fund returns look artificially better. AMFI publishes TRI for major indices. `[ASSUMED — confirm Phase 2 ingests TRI not PRI]`

**NAV-timing rule:** fund returns use NAV at IST market close on `asOfDate - businessDaysOffset(N years)`. If `asOfDate` is itself a non-business day, snap backward to the most recent business day before computing.

### Fund — Pillar 2: Risk-Adjusted (25%)

| Sub-factor | Weight | Direction | Source |
|---|---|---|---|
| Sharpe ratio (3Y, monthly returns, annualised) | 0.50 | higher | `(avgExcessReturn / stddev) * sqrt(12)` using monthly NAV log returns |
| Sortino ratio (3Y, monthly returns, annualised) | 0.50 | higher | same, but stddev computed only over negative excess returns |

**Risk-free rate input:** 10-year G-Sec yield, monthly snapshot, sourced from RBI Weekly Statistical Supplement [ASSUMED — endpoint and snapshot cadence to be wired in Phase 2; for this phase, scoring core treats `riskFreeRateMonthly: Decimal[]` as injected input].

### Fund — Pillar 3: Consistency (15%)

| Sub-factor | Weight | Direction | Source |
|---|---|---|---|
| Quartile-rank stability — % of rolling 1Y windows over last 5Y where fund was in top-2 quartiles within its category | 0.60 | higher | computed from monthly NAV vs category-median NAV history |
| Downside-capture ratio (3Y) vs benchmark | 0.40 | lower | `(avg negative-month fund return) / (avg negative-month benchmark return)`; `<80% → 10`, `80–100% → 7`, `100–120% → 4`, `>120% → 0` |

### Fund — Pillar 4: Costs (10%)

| Sub-factor | Weight | Direction | Source |
|---|---|---|---|
| Expense ratio vs category median | 1.00 | lower | percentile rank of `(fundExpenseRatio - categoryMedian)`; lower is better |

**Plan discipline:** v1 scores **direct-plan / growth-option** only. Regular plans and IDCW options are excluded from scoring; the instrument-master mapping (DATA-01) keys on `amfiSchemeCode + planType + option`. Mixing direct and regular returns in the same score is one of the documented gotchas (PITFALLS.md #8).

### Fund — Pillar 5: Manager Quality (10%)

| Sub-factor | Weight | Direction | Source |
|---|---|---|---|
| Current manager tenure on this fund (years) | 0.50 | higher | `<1y → 3 / 1–3y → 6 / 3–5y → 8 / >5y → 10` |
| Median 3Y CAGR across all funds the manager has run (weighted by AUM) | 0.50 | higher | percentile rank within manager universe |

### Fund — Pillar 6: Portfolio Quality (5%)

| Sub-factor | Weight | Direction | Source |
|---|---|---|---|
| Top-10 holdings concentration (% of AUM) | 0.40 | lower | `<25% → 10 / 25–40% → 7 / 40–60% → 4 / >60% → 0` |
| Sector tilt vs benchmark (sum of absolute sector overweights, %) | 0.30 | lower | `<10% → 10 / 10–20% → 7 / 20–30% → 4 / >30% → 0` |
| Portfolio turnover (annual) | 0.30 | lower | `<25% → 10 / 25–75% → 7 / 75–150% → 4 / >150% → 0` |

## Verdict Mapping (locked)

> The PRD §10.2 5-band BUY/SELL ladder is **collapsed** to the 3-band compliance enum. Document the mapping in code as a single switch; never reintroduce the verbs.

| Final score | Verdict enum | Notes |
|---|---|---|
| `>= 8.5` | `STRONG_SCORE` | High conviction. Surfaces in UI as e.g. "Strong Score" (Phase 4 copy decision). |
| `>= 5.0 AND < 8.5` | `CAUTION` | Absorbs PRD's BUY (7.0–8.4) + HOLD (5.0–6.9) — both are "mixed enough to warrant caution" under SEBI substance-over-form scrutiny. |
| `< 5.0` | `WEAK_SCORE` | Absorbs PRD's REDUCE (3.0–4.9) + SELL (0–2.9). |

Implementation:

```typescript
export function toVerdict(score: Decimal): Verdict {
  if (score.gte(8.5)) return Verdict.STRONG_SCORE;
  if (score.gte(5.0)) return Verdict.CAUTION;
  return Verdict.WEAK_SCORE;
}
```

## Numerical Pipeline & Determinism

### Decimal policy

```typescript
// scoring/stock/decimal.ts
import Decimal from 'decimal.js';
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 20,
});
export { Decimal };
```

- **Inputs** (prices, ratios) are converted from `number` → `Decimal` at the *boundary* of the scoring core. All arithmetic inside is `Decimal`. The final score is converted back to `number` for the API response and for Mongo storage (Mongoose stores as `Number` — that's fine, the determinism contract is on the *computation*, not the storage representation).
- **Per-sub-factor normalisation** rounds HALF_UP to **4 decimal places**.
- **Per-pillar score** rounds HALF_UP to **4 decimal places**.
- **Final 1–10 score** rounds HALF_UP to **1 decimal place**.
- Two rounding stops (4 dp intermediate, 1 dp final) is the minimum needed to keep snapshot tests stable across Node 20 / 22 / 24 and across macOS / Linux CI runners.

### Determinism contract

For any `(input1, input2)` such that `deepEqual(input1, input2)`: `scoreStock(input1) === scoreStock(input2)` value-equal. Enforced by:
1. **Vitest snapshot tests** on a fixed basket of 10 stock fixtures + 5 fund fixtures.
2. **Property test** (`fast-check`): `forAll(arbitraryScoreInput) → result.score >= 0 && result.score <= 10 && sumOfWeightedContributions ≈ result.score` (within 0.05 to allow for final rounding).
3. **Property test:** monotonicity — increasing a sub-factor that is `direction: 'higher'` (with all else equal) does not decrease the pillar score.
4. **Cross-run regression** — CI runs the snapshot suite on Node 20 and Node 22; both must match the committed snapshot exactly.

### IST timezone discipline

```typescript
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
const IST = 'Asia/Kolkata';

// "Today's asOfDate" from a wall-clock instant
export function asOfDateFor(now: Date): string {
  // YYYY-MM-DD in IST, stored as ISO date string
  return formatInTimeZone(now, IST, 'yyyy-MM-dd');
}
```

The EOD job's cron runs at `0 18 * * *` IST. The `asOfDate` it computes for a job that started at 18:00 IST on 2026-05-28 is `'2026-05-28'`. NAV cutoffs, holiday snaps, and `priceHistory` slicing all use this single `asOfDate` string.

## Score History & EOD Job (SCORE-04)

### Time-series collection schema

```typescript
// jobs/eod-recompute/score-history.schema.ts
import { Schema } from 'mongoose';

export const ScoreHistorySchema = new Schema(
  {
    instrumentId: { type: Schema.Types.ObjectId, ref: 'Instrument', required: true },
    instrumentType: { type: String, enum: ['STOCK', 'FUND'], required: true },
    asOfDate: { type: String, required: true },     // 'YYYY-MM-DD' IST
    computedAt: { type: Date, required: true },     // wall-clock UTC for the time-series timeField
    score: { type: Number, required: true },        // final 1–10 (Number is fine; computation was Decimal)
    verdict: { type: String, enum: ['STRONG_SCORE', 'CAUTION', 'WEAK_SCORE'], required: true },
    pillars: { type: Schema.Types.Mixed, required: true },  // PillarBreakdown[] — JSON
    scoringEngineVersion: { type: String, required: true }, // semver of scoring core for traceability
  },
  {
    timeseries: {
      timeField: 'computedAt',
      metaField: 'instrumentId',
      granularity: 'hours',
    },
    expireAfterSeconds: 60 * 60 * 24 * 365 * 3, // 3-year retention; renew as needed
  },
);
```

**Why `granularity: 'hours'`:** MongoDB time-series accepts `seconds | minutes | hours`. The job writes one document per instrument per day, so per-instrument writes are 24h apart. `'hours'` is the closest valid bucket and produces well-compressed buckets without storage bloat. (`'minutes'` would over-bucket; `'seconds'` is wrong for daily cadence.)

**Indexing:** MongoDB time-series auto-indexes on `metaField` and `timeField` and serves `find({instrumentId, computedAt: {$lte: X}}).sort({computedAt: -1}).limit(1)` (the "latest score" query) without extra indexes. No additional secondary indexes required for v1.

**`scoringEngineVersion`:** SemVer of the scoring core (`packages/scoring/package.json` → `version`). When the scoring algorithm changes, this changes — old history is queryable but never mixed with new scores in trend lines. The version is read at module-init from the package JSON.

### Producer (parent job)

```typescript
// jobs/eod-recompute/eod-recompute.producer.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class EodRecomputeProducer implements OnModuleInit {
  constructor(
    @InjectQueue('eod-recompute') private readonly queue: Queue,
    private readonly instruments: InstrumentMasterService,
    private readonly clock: ClockService,
  ) {}

  async onModuleInit() {
    // Repeatable schedule — survives restarts, deduped across replicas
    await this.queue.upsertJobScheduler(
      'eod-recompute-daily',
      { pattern: '0 12 * * *', tz: 'Asia/Kolkata' }, // 18:00 IST
      { name: 'eod-recompute-parent', opts: { removeOnComplete: 50, removeOnFail: 100 } },
    );
  }

  // The processor for `eod-recompute-parent` calls this:
  async fanOut(asOfDate: string): Promise<{ enqueued: number; chunks: number }> {
    const universe = await this.instruments.activeUniverse(asOfDate);
    let enqueued = 0;
    let chunks = 0;
    for (const chunk of chunked(universe, 100)) {
      await this.queue.addBulk(
        chunk.map((inst) => ({
          name: 'eod-recompute-child',
          data: { instrumentId: inst.id.toString(), instrumentType: inst.type, asOfDate },
          opts: {
            jobId: `${inst.id}:${asOfDate}`, // idempotent — duplicates rejected
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: true,
            removeOnFail: 500,
          },
        })),
      );
      enqueued += chunk.length;
      chunks += 1;
    }
    return { enqueued, chunks };
  }
}
```

### Processor (child job)

```typescript
// jobs/eod-recompute/eod-recompute.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { scoreStock, scoreFund } from '../../scoring';

@Processor('eod-recompute', { concurrency: 10 })
export class EodRecomputeProcessor extends WorkerHost {
  constructor(
    private readonly stocks: StocksService,
    private readonly funds: FundsService,
    private readonly history: ScoreHistoryRepository,
    private readonly version: ScoringEngineVersionProvider,
  ) { super(); }

  async process(job: Job): Promise<void> {
    if (job.name === 'eod-recompute-parent') {
      await this.producer.fanOut(job.data.asOfDate);
      return;
    }
    // child
    const { instrumentId, instrumentType, asOfDate } = job.data;
    const input = instrumentType === 'STOCK'
      ? await this.stocks.loadScoreInput(instrumentId, asOfDate)
      : await this.funds.loadScoreInput(instrumentId, asOfDate);
    const result = instrumentType === 'STOCK' ? scoreStock(input) : scoreFund(input);
    await this.history.upsert({
      instrumentId, instrumentType, asOfDate,
      computedAt: new Date(),
      score: result.score.toNumber(),
      verdict: result.verdict,
      pillars: result.pillars,
      scoringEngineVersion: this.version.current(),
    });
  }
}
```

### Failure policy

| Failure mode | Behaviour |
|---|---|
| Single instrument throws (bad data, missing fundamentals) | Retry 3× with exponential backoff. After 3 failures, child lands in BullMQ `failed` set. Parent continues. Failure logged with `instrumentId + reason`. |
| Mongo write fails | Treated as transient; same retry policy. |
| Parent job throws while building universe | Parent retries 3×, then alerts. No children enqueued — next day's cron retries. |
| Redis unavailable | BullMQ surfaces connection error; pm2/k8s health probe should restart worker. No score history written (acceptable — yesterday's score remains the latest queryable). |

## Common Pitfalls

### Pitfall 1: Survivorship bias in peer cohorts
**What goes wrong:** Peer cohort is built from today's `instruments` collection rather than the universe as of `asOfDate`. Every historical recompute is biased upward because delisted / merged failures are silently excluded.
**Why it happens:** `instruments.find({sector, marketCapBucket})` is the obvious one-liner. It's wrong.
**How to avoid:** `PeerCohortService.snapshot(target, asOfDate)` filters on `listedAsOf <= asOfDate AND (delistedAsOf IS NULL OR delistedAsOf > asOfDate)`. Instrument master (DATA-01, Phase 2) must persist `listedAsOf` and `delistedAsOf`.
**Warning signs:** A recomputed score from 2024 today differs from the originally-computed score in 2024 by more than the explainable corporate-action adjustment. Run a backtest-regression CI gate.

### Pitfall 2: NAV-timing mismatch on funds
**What goes wrong:** Fund return for "1Y ending 2026-05-28" is computed against a benchmark intraday level instead of benchmark close-of-prior-business-day NAV-equivalent. Or, `asOfDate` lands on a market holiday and the loader returns yesterday's NAV without snapping.
**Why it happens:** NAVs are end-of-day and lagged; index levels are continuous.
**How to avoid:** `loadScoreInput` snaps `asOfDate` to the most recent NSE/BSE business day. Fund return uses NAV at that day's close; benchmark uses TRI close on the same day. Holiday calendar comes from Phase 2 (DATA-05).
**Warning signs:** A fund's score jumps by >1.0 on a Monday following a long weekend, but the actual NAV moved < 1%.

### Pitfall 3: Floating-point drift across Node versions / CI runners
**What goes wrong:** Snapshot tests pass on macOS Node 22 in dev, fail on Linux Node 20 in CI by 0.0001 on a sub-factor.
**Why it happens:** Native `Number` arithmetic differs in the last bits across libm implementations.
**How to avoid:** All arithmetic via `decimal.js`. Round HALF_UP at 4 dp between pillars; HALF_UP at 1 dp for final score. Run snapshot suite on both Node 20 and 22 in CI matrix.
**Warning signs:** "Works locally, fails in CI." Snapshot diff is in the 4th decimal place.

### Pitfall 4: Sentiment fallback computed wrong
**What goes wrong:** Phase 6 ships and someone removes the `if (input.sentiment == null)` guard, assuming sentiment is always present. Then Phase 6's news pipeline has an outage and the EOD job crashes.
**Why it happens:** The guard "feels obsolete" once real data exists.
**How to avoid:** The guard is permanent. Sentiment data can always be missing for a fresh-listed stock, a delisted re-list, or a news-pipeline outage. Add a Vitest test that explicitly passes `input.sentiment = null` and asserts the fallback fires.
**Warning signs:** EOD job failure rate spikes after a news-pipeline incident.

### Pitfall 5: Idempotency-key collision missing `asOfDate`
**What goes wrong:** `jobId: instrumentId` instead of `jobId: '${instrumentId}:${asOfDate}'`. Tomorrow's recompute for the same instrument is silently rejected as a duplicate.
**Why it happens:** Quick-fix simplification.
**How to avoid:** Lint rule or code review checklist. Include the `asOfDate` in the integration test that runs the EOD job two days in a row.
**Warning signs:** `score_history` has only one document per instrument, ever.

### Pitfall 6: Unadjusted price series in technical pillar
**What goes wrong:** RSI / MACD computed on raw close prices, which include split/bonus gaps. Every stock that ever split looks like it crashed and recovered repeatedly.
**Why it happens:** Phase 2 must guarantee adjusted series (DATA-05). The scoring core assumes that contract.
**How to avoid:** Assert in `loadScoreInput` that `priceHistory.adjusted === true`. Reject input otherwise.
**Warning signs:** A recently-split stock shows a Technical pillar score wildly different from its peer cohort.

### Pitfall 7: Cron firing twice in multi-replica deployment
**What goes wrong:** Two API replicas both register the repeatable cron. Two parent jobs run nightly. Universe is fanned out twice. Children are deduped by `jobId` (good), but the second parent burns CPU listing the universe.
**Why it happens:** Naive `onModuleInit()` registration.
**How to avoid:** BullMQ `upsertJobScheduler` is idempotent on the scheduler key (`'eod-recompute-daily'`) — calling it from two replicas results in one schedule. Confirmed by checking BullMQ source. Verify with a 2-replica integration test.
**Warning signs:** `eod-recompute-parent` job count > 1 per day in BullBoard.

### Pitfall 8: Score-history write before scoring completes (partial state)
**What goes wrong:** Refactor moves the `history.upsert()` outside a try/catch and a downstream service throws. Half a score is written.
**Why it happens:** Optimistic refactoring.
**How to avoid:** `history.upsert()` is the **last** statement in the processor. If anything throws, BullMQ retries the entire job; the upsert is keyed on `(instrumentId, asOfDate)` and replaces on retry.
**Warning signs:** `score_history` has documents with `pillars: undefined` or `score: null`.

## Code Examples

### Top-level `scoreStock` (pure)

```typescript
// scoring/stock/score-stock.ts
import { Decimal } from './decimal';
import { scoreFundamentalsPillar } from './pillars/fundamentals';
import { scoreValuationPillar } from './pillars/valuation';
import { scoreTechnicalPillar } from './pillars/technical';
import { scoreSentimentPillar } from './pillars/sentiment';
import { scoreRiskPillar } from './pillars/risk';
import { scoreEventPillar } from './pillars/event';
import { toVerdict } from './compose';
import type { ScoreStockInput, ScoreResult } from '../types';

const WEIGHTS = {
  fundamentals: new Decimal('0.35'),
  valuation:    new Decimal('0.20'),
  technical:    new Decimal('0.20'),
  sentiment:    new Decimal('0.10'),
  risk:         new Decimal('0.10'),
  event:        new Decimal('0.05'),
} as const;

export function scoreStock(input: ScoreStockInput): ScoreResult {
  const pillars = [
    scoreFundamentalsPillar(input.fundamentals, input.peerCohort, WEIGHTS.fundamentals),
    scoreValuationPillar(input.valuation, input.peerCohort, WEIGHTS.valuation),
    scoreTechnicalPillar(input.technical, input.peerCohort, WEIGHTS.technical),
    scoreSentimentPillar(input.sentiment, WEIGHTS.sentiment),  // null-safe
    scoreRiskPillar(input.risk, input.peerCohort, WEIGHTS.risk),
    scoreEventPillar(input.event, WEIGHTS.event),
  ];
  const total = pillars.reduce(
    (acc, p) => acc.plus(p.weightedContribution),
    new Decimal(0),
  );
  const finalScore = Decimal.min(Decimal.max(total, 0), 10).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
  return {
    score: finalScore.toNumber(),
    verdict: toVerdict(finalScore),
    pillars,
    inputHash: input._inputHash, // computed by loader for explainability
    scoringEngineVersion: VERSION,
  };
}
```

### Percentile-rank normaliser

```typescript
// scoring/stock/normalise.ts
import { Decimal } from './decimal';

export type Direction = 'higher' | 'lower';

export function percentileRank(
  value: Decimal,
  peerValues: Decimal[],
  direction: Direction,
): Decimal {
  if (peerValues.length === 0) {
    return new Decimal(5); // neutral if no peers
  }
  const sorted = [...peerValues].sort((a, b) =>
    direction === 'higher' ? a.minus(b).toNumber() : b.minus(a).toNumber(),
  );
  const belowOrEqual = sorted.filter((p) =>
    direction === 'higher' ? p.lte(value) : p.gte(value),
  ).length;
  const pct = new Decimal(belowOrEqual).div(sorted.length).times(10);
  return pct.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}
```

### Snapshot determinism test

```typescript
// scoring/stock/__tests__/score-stock.snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { scoreStock } from '../score-stock';
import { RELIANCE_2026_05_27, HDFCBANK_2026_05_27 /* ... */ } from './fixtures';

describe('scoreStock — snapshot determinism', () => {
  it.each([
    ['RELIANCE 2026-05-27', RELIANCE_2026_05_27],
    ['HDFCBANK 2026-05-27', HDFCBANK_2026_05_27],
    // ... 10 total
  ])('produces stable score for %s', (_, fixture) => {
    const result = scoreStock(fixture);
    expect(result).toMatchSnapshot();
  });
});
```

### Property test (bounds + monotonicity)

```typescript
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { scoreStock } from '../score-stock';
import { arbScoreInput } from './arbitraries';

describe('scoreStock — properties', () => {
  it('always returns score in [0, 10]', () =>
    fc.assert(fc.property(arbScoreInput, (input) => {
      const r = scoreStock(input);
      return r.score >= 0 && r.score <= 10;
    })));

  it('weighted contributions sum to score (± rounding tolerance)', () =>
    fc.assert(fc.property(arbScoreInput, (input) => {
      const r = scoreStock(input);
      const sum = r.pillars.reduce((a, p) => a + p.weightedContribution.toNumber(), 0);
      return Math.abs(sum - r.score) < 0.1;
    })));
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| BullMQ `Queue.add(..., { repeat: { ... } })` | `Queue.upsertJobScheduler(key, { pattern, tz }, opts)` | BullMQ 5.x | Old API is deprecated; new API is idempotent on scheduler key and survives restarts cleanly |
| `@nestjs/bull` + `bull` | `@nestjs/bullmq` + `bullmq` | BullMQ became the official successor; `bull` is in maintenance | Use BullMQ for any new code (already locked in stack) |
| Mongo regular collection + TTL index for price/score history | MongoDB time-series collections | MongoDB 5.0+ | Better compression, optimised range queries by metaField |
| Hand-rolled cron via `node-cron` inside NestJS | BullMQ repeatable / scheduler | BullMQ matured to handle reliable scheduling | Removes need for separate scheduling lib; cron observable via BullBoard |

**Deprecated / not for v1:**
- DCF-implied valuation sub-factor — defer; no engine to compute it.
- Social-mentions sub-factor in Sentiment pillar — defer; no provider integrated.
- Analyst-consensus sub-factor — defer unless a provider lands by Phase 6.

## Runtime State Inventory

> Not applicable — this is a greenfield phase. No rename, refactor, or migration. New code, new collection, new BullMQ queue.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | Scoring core + worker | ✓ | v24.14.0 (system) — pin project to ≥ 20.18 | — |
| Redis | BullMQ backend | ✓ | local redis-cli responded PONG | Docker Redis container for dev parity |
| MongoDB Atlas (ap-south-1) | `score_history` time-series collection | Out-of-band (Atlas project — created in Phase 1) | — | Local Mongo 7+ for dev (time-series collections supported since 5.0) |
| `mongosh` | DBA inspection of `score_history` | ✗ | — | Use Atlas UI / MongoDB Compass; install `mongosh` via `brew install mongosh` if needed |
| `pnpm` | monorepo install | Assumed from Phase 1 (Turborepo) | — | — |

**Missing dependencies with fallback:**
- `mongosh` — Atlas UI or Compass covers inspection during phase. Not blocking.

**Blocking missing dependencies:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest 4.1.7 (preferred) — or Jest 30.4.2 if Phase 1 picked Jest for `apps/api`. Defer to that choice; tests work in either. |
| Config file | `apps/api/vitest.config.ts` (or `jest.config.ts`) — confirmed in Wave 0 |
| Quick run command | `pnpm --filter @finsight/api test -- scoring/` |
| Full suite command | `pnpm --filter @finsight/api test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| SCORE-01 | `scoreStock(input)` returns `{score: 0..10, verdict, pillars[]}` for valid input | unit | `pnpm --filter @finsight/api test -- scoring/stock/score-stock.test.ts` | ❌ Wave 0 |
| SCORE-01 | Sentiment pillar returns 5.0 + `isFallback: true` when `input.sentiment == null` | unit | `pnpm --filter @finsight/api test -- scoring/stock/pillars/sentiment.test.ts` | ❌ Wave 0 |
| SCORE-02 | `scoreFund(input)` parallels the stock contract | unit | `pnpm --filter @finsight/api test -- scoring/fund/score-fund.test.ts` | ❌ Wave 0 |
| SCORE-03 | Result includes per-pillar breakdown with sub-factor rawValues, normalised values, weight, contribution | unit | `pnpm --filter @finsight/api test -- scoring/stock/score-stock.breakdown.test.ts` | ❌ Wave 0 |
| SCORE-04 | EOD producer enqueues one child per active instrument, jobId `${id}:${asOfDate}` | integration (Redis required) | `pnpm --filter @finsight/api test -- jobs/eod-recompute/eod-recompute.producer.int.test.ts` | ❌ Wave 0 |
| SCORE-04 | Child processor writes one document to `score_history` time-series collection | integration (Mongo required) | `pnpm --filter @finsight/api test -- jobs/eod-recompute/eod-recompute.processor.int.test.ts` | ❌ Wave 0 |
| SCORE-04 | Same `asOfDate` re-run does NOT duplicate writes (idempotent) | integration | included in above | ❌ Wave 0 |
| SCORE-05 | Vitest snapshot on 10 stock + 5 fund fixtures is stable across Node 20 & 22 | snapshot + CI matrix | `pnpm --filter @finsight/api test -- scoring/__tests__/snapshot.test.ts` | ❌ Wave 0 |
| SCORE-05 | `fast-check` property: score ∈ [0,10] for arbitrary inputs | property | `pnpm --filter @finsight/api test -- scoring/__tests__/property.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @finsight/api test -- scoring/` (≤ 5s for unit + snapshot)
- **Per wave merge:** `pnpm --filter @finsight/api test` (full suite incl. integration; ≤ 60s)
- **Phase gate:** Full suite green on Node 20 AND Node 22 matrix before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/scoring/__tests__/fixtures/` — 10 stock + 5 fund frozen fixtures (real names: RELIANCE, HDFCBANK, INFY, TCS, ITC, KOTAKBANK, BAJFINANCE, MARUTI, ASIANPAINT, SUNPHARMA — pick a basket that spans sectors)
- [ ] `apps/api/src/scoring/__tests__/arbitraries.ts` — `fast-check` arbitrary builders for `ScoreStockInput` / `ScoreFundInput`
- [ ] `apps/api/src/scoring/decimal.ts` — `Decimal.set` config (precision 20, ROUND_HALF_UP)
- [ ] `apps/api/src/jobs/eod-recompute/__tests__/redis-test-harness.ts` — Testcontainers Redis or `ioredis-mock` for integration tests
- [ ] `apps/api/src/jobs/eod-recompute/__tests__/mongo-test-harness.ts` — `mongodb-memory-server` (with `--replSet` flag — time-series collections require it) OR a local Mongo instance
- [ ] CI matrix entry: Node 20 + Node 22, both must pass scoring snapshot suite
- [ ] Decision: Vitest vs Jest — confirm Phase 1's choice and standardise here

## Security Domain

> `security_enforcement` not explicitly disabled — included per protocol. This phase is internal compute; security surface is small but real.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | partial | Admin-only manual recompute endpoint (if exposed) must use existing IAM v2 guard from Phase 1 |
| V3 Session Management | no | No session state in scoring core |
| V4 Access Control | partial | Manual recompute endpoint scoped to admin role; `score_history` reads are public to authenticated users (no PII) |
| V5 Input Validation | yes | `ScoreInput` constructed by trusted loader from Phase-2-validated data; if any external recompute endpoint exists, use `class-validator` DTO with `whitelist: true, forbidNonWhitelisted: true` |
| V6 Cryptography | no | No crypto; no secrets in scoring core |
| V7 Error Handling | yes | Job failures must not leak internal stack traces to API responses or logs in PII-readable form |
| V11 Business Logic | yes | Idempotency key + retry policy prevent duplicate / lost score writes; survivorship-safe peer cohort prevents biased scoring |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Adversarial input crashes scoring core (NaN, Infinity, Decimal overflow) | Denial of Service | Loader rejects non-finite / out-of-range numbers; `class-validator` DTO; fast-check finds these in tests |
| Manual recompute endpoint hammered by authenticated user → cost / Mongo write blowup | Denial of Service | Rate-limit (existing Redis facade from Phase 1) + admin role required |
| Score manipulation by altering an external data source | Tampering | DATA-04 schema validation + range/sanity assertions at ingestion (Phase 2 contract); scoring core trusts validated input |
| `score_history` exposes patterns that allow inference of un-disclosed corporate events | Information Disclosure | Acceptable in v1: history is public knowledge equivalent. Revisit only if user-private scoring is added |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Market-cap bucket bands (Large >₹50K cr / Mid ₹15–50K cr / Small ₹5–15K cr / Micro <₹5K cr) match the project's intended segmentation | Pillar Sub-Formulas — peer cohort definition | Wrong cohorts → wrong percentile ranks → systematically off-by-one scores; easy to retune post-hoc but worth confirming with user up front |
| A2 | Within-pillar weights for Fundamentals (equal 1/8 each) and the other pillars (as tabled) are acceptable defaults | Pillar Sub-Formulas — all stock pillars | Different intra-pillar weighting changes the score; rebalancing is cheap but invalidates frozen snapshot fixtures |
| A3 | Absolute-band fallback thresholds (e.g. ROE `<5% → 0, 5–15% → 5, ...`) are sensible | Pillar Sub-Formulas — all stock fallback tables | Used only when cohort < 20; affects micro-cap / new-listing scoring most |
| A4 | DCF-implied valuation sub-factor is deferred from v1 | Valuation pillar | If user wants DCF v1, this phase grows materially (needs cash-flow projection module) |
| A5 | Analyst-consensus sub-factor in Sentiment pillar is deferred — no provider lined up | Sentiment pillar | Reduces Sentiment pillar nuance; mitigated by 30-day AI sentiment dominating that pillar |
| A6 | Risk-free rate is the 10Y G-Sec yield, monthly snapshot, sourced from RBI WSS | Fund Risk-Adjusted pillar | Different choice (e.g. T-bill rate, repo rate) shifts Sharpe/Sortino values uniformly — score percentile ranks barely move |
| A7 | Fund scoring covers **direct-plan / growth-option only** in v1; regular plans and IDCW excluded | Fund Costs pillar | If user wants regular plans scored too, instrument-master keying needs to be expanded and category-median calcs need to split |
| A8 | Phase 2 (DATA-05) emits split / bonus / dividend-adjusted price series as the contract | Technical pillar | If unadjusted, all technical scores corrupt — surface in Phase 2 plan |
| A9 | Phase 2 ingests **Total-Return Index (TRI)** for benchmarks, not Price Return Index | Fund Returns pillar | TRI vs PRI gap is meaningful (~1–2% / year from dividends); flag for Phase 2 if not already locked |
| A10 | 3-year retention TTL on `score_history` is acceptable | EOD job schema | Cheap to extend; doesn't affect compute |
| A11 | Cron at 18:00 IST is the right window (post-NSE close at 15:30 + safety buffer) | EOD job | If MFAPI NAV publishes later, push to 20:00 IST. Confirm with Phase 2 NAV-publish timing observation |
| A12 | Concurrency of 10 per worker process is a sensible start | EOD job tuning | Tune after first prod run; not a contract |

**Action for /gsd-discuss-phase or planner:** confirm A1, A4, A6, A7, A11 with user before implementation begins. A2 / A3 are cheap to retune; defer. A8 / A9 propagate back to Phase 2 — surface in this phase's CONTEXT.md.

## Open Questions

1. **Vitest or Jest in `apps/api`?**
   - What we know: stack research mentions Vitest; NestJS CLI default is Jest.
   - What's unclear: which one Phase 1 actually scaffolded.
   - Recommendation: read `apps/api/package.json` at planning time; standardise on whichever exists. Both have identical relevant API surface for these tests.

2. **Is the manual-recompute admin endpoint in scope for SCORE-04, or only the cron?**
   - What we know: SCORE-04 says "nightly BullMQ job recomputes …". The cron covers it.
   - What's unclear: whether ops need a "rerun this instrument now" hook.
   - Recommendation: ship a thin admin POST `/admin/scoring/recompute` that enqueues a child job (with auth + rate-limit) — small surface, high ops value. Plannable as the last task in the phase; cuttable if pressed for time.

3. **Where does `scoringEngineVersion` come from?**
   - What we know: SemVer must be readable at runtime.
   - What's unclear: pulled from `packages/scoring/package.json` (if separate workspace package) or hard-coded constant inside `scoring/index.ts`.
   - Recommendation: separate `packages/scoring` workspace package; version-bump via Changesets when the algorithm changes. Defer to planner.

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` — locked constraints, weights, invariants
- `.planning/REQUIREMENTS.md` — SCORE-01..05 wording
- `.planning/ROADMAP.md` — Phase 3 goal + success criteria
- `.planning/research/SUMMARY.md` — locked stack, architectural invariants, version pins (verified npm 2026-05-27)
- `.planning/research/PITFALLS.md` — scoring-correctness pitfalls #4, #5, #8, #9 (survivorship, NAV timing, market quirks, Mongo TS/index pitfalls)
- `FinSight_AI_PRD.docx` §10 — pillar weights, sub-factor lists, MF parallel framework (extracted 2026-05-27)
- npm registry (live, 2026-05-28) — version verification: `bullmq 5.77.6`, `@nestjs/bullmq 11.0.4`, `decimal.js 10.6.0`, `vitest 4.1.7`, `fast-check 4.8.0`, `mongoose 9.6.3`, `ioredis 5.11.0`, `class-validator 0.15.1`, `date-fns 4.3.0`, `date-fns-tz 3.2.0`, `@nestjs/common 11.1.24`, `big.js 7.0.1`, `jest 30.4.2`

### Secondary (MEDIUM confidence)
- [Tickertape Scorecard — Fundamental Score](https://help.tickertape.in/support/solutions/articles/82000142926-fundamental-score) — "score helps rank the stock versus all other stocks in the respective sector"; confirms percentile-rank-within-sector pattern
- [Tickertape Scorecard — Value Momentum Rank](https://help.tickertape.in/support/solutions/articles/82000142923-value-momentum-rank) — "percentile ranking (0–100) of the stock, against all other stocks in the country, based on recent valuation as well as price momentum"
- [Tickertape Scorecard — Introducing Scorecard](https://www.tickertape.in/blog/introducing-scorecard-stock-analysis-got-quicker-and-better-with-quantitative-insights/) — four-card structure (Performance, Valuation, Growth, Profitability) confirms multi-pillar 0–10 approach
- [Trendlyne DVM Score](https://trendlyne.com/score-details/) — Durability/Valuation/Momentum 0–100, daily intraday updates, threshold bands for G/B classification

### Tertiary (LOW confidence — engineering-knowledge defaults, not externally cited)
- Within-pillar weights and absolute-band fallback thresholds — recommendations based on standard equity research patterns. Worth user review (Assumptions A2, A3).
- Market-cap bucket cutoffs — common Indian retail-research segmentation; not a single authoritative source (Assumption A1).

## Metadata

**Confidence breakdown:**
- Standard stack — HIGH — versions verified live 2026-05-28 against npm registry; stack locked upstream.
- Architecture (pure core + BullMQ fan-out + TS collection) — HIGH — matches upstream SUMMARY.md, follows BullMQ 5.x official patterns, validated against MongoDB TS docs and time-series limitations.
- Pillar weights and structure — HIGH — directly from PRD §10.
- Pillar sub-factor algorithms (normalisation, peer cohort, fallback bands) — MEDIUM — informed by Tickertape Scorecard / Trendlyne DVM patterns plus engineering judgement; some choices marked `[ASSUMED]` for user confirmation.
- Pitfalls — HIGH — inherited from PITFALLS.md (already HIGH on scoring-correctness items) and validated against scoring-engine domain knowledge.
- BullMQ implementation details — HIGH — `upsertJobScheduler` API verified per BullMQ 5.x migration docs; idempotency-key pattern is canonical.

**Research date:** 2026-05-28
**Valid until:** 2026-06-27 (30 days — stack is stable; revisit if BullMQ ships a 6.x major or `@google/genai` changes affect adjacent phases)
