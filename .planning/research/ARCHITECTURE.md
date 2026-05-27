# Architecture Research

**Domain:** AI-powered investment-research web app (Indian stocks + mutual funds), Next.js 15 + NestJS + MongoDB + Redis/BullMQ + Gemini
**Researched:** 2026-05-27
**Confidence:** HIGH (structure is determined by the locked stack and two stated invariants; external facts on Gemini caching and Atlas verified against official docs)

> This document architects *within* the locked stack. It is opinionated by design. The two non-negotiable invariants drive nearly every boundary decision:
> 1. **Numbers are deterministic.** The Scoring engine computes every score/metric from real data. Gemini never produces a number.
> 2. **All AI output passes a compliance sanitisation layer** ("analysis, not advice"), at a single enforced chokepoint.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Next.js 15 (App Router)                          │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────────┐ │
│  │ Public SEO     │  │ Auth-gated app │  │ Ask FinSight chat (CSR)  │ │
│  │ /stock/[t]     │  │ dashboard,     │  │ streams from NestJS      │ │
│  │ /fund/[s]      │  │ watchlist      │  │                          │ │
│  │ RSC, reads     │  │                │  │                          │ │
│  │ cache→Mongo    │  │                │  │                          │ │
│  └───────┬────────┘  └───────┬────────┘  └────────────┬─────────────┘ │
└──────────┼───────────────────┼────────────────────────┼───────────────┘
           │ HTTPS (REST + SSE) — NestJS is the only data authority       │
┌──────────┴───────────────────┴────────────────────────┴───────────────┐
│                          NestJS API (modular monolith)                 │
│                                                                        │
│  Edge / boundary modules                                               │
│  ┌────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐ ┌────────┐            │
│  │ Auth   │ │ Stocks  │ │ Funds  │ │ Watchlist│ │ Search │  (HTTP)    │
│  └────────┘ └────┬────┘ └───┬────┘ └────┬─────┘ └───┬────┘            │
│                  │          │           │           │                  │
│  Core domain     │          │           │           │                  │
│  ┌───────────────┴──────────┴───────────┴───────────┴──────────────┐  │
│  │ ScoringModule (PURE — no I/O)   ScoreHistoryModule (time-series) │  │
│  │ NewsModule   SentimentModule    SearchModule                     │  │
│  └───────────────────────────┬──────────────────────────────────────┘ │
│                              │                                          │
│  AI + compliance            │            Infra / cross-cutting          │
│  ┌──────────────────────────┴───┐  ┌──────────────────────────────┐    │
│  │ AIModule (Gemini facade)     │  │ DataIngestionModule          │    │
│  │   ↳ ComplianceModule         │  │   adapters + fallback chain   │    │
│  │     (interceptor, chokepoint)│  │ CacheModule (Redis)           │    │
│  └──────────────────────────────┘  │ JobsModule (BullMQ queues)    │    │
│                                     └──────────────────────────────┘    │
└──────────────────────────────────┬─────────────────────────────────────┘
            ┌──────────────┬────────┼──────────────┬──────────────┐
            ▼              ▼        ▼               ▼              ▼
     ┌───────────┐  ┌──────────┐ ┌─────────┐ ┌───────────┐ ┌──────────────┐
     │ MongoDB   │  │ Mongo    │ │ Mongo   │ │ Redis     │ │ External      │
     │ Atlas     │  │ time-    │ │ Vector  │ │ cache +   │ │ providers     │
     │ (docs)    │  │ series   │ │ Search  │ │ BullMQ +  │ │ Yahoo/MFAPI/  │
     │           │  │ (scores) │ │ (news)  │ │ sessions  │ │ AMFI/NSE/RSS  │
     └───────────┘  └──────────┘ └─────────┘ └───────────┘ │ + Gemini API  │
                                                            └──────────────┘
```

**Deployment note (HIGH):** Atlas Vector Search and Atlas Search are **MongoDB Atlas features** — they are not available on self-hosted Community MongoDB. Despite the PROJECT.md "self-hosted ap-south-1" data-residency line, the news/semantic-search and autocomplete features pin you to **Atlas (Mumbai region, ap-south-1)**. Treat Atlas-in-Mumbai as the deployment target; it satisfies DPDP residency. (See PITFALLS.)

### Component Responsibilities

| Component | Responsibility (owns) | Depends on | Talks to |
|-----------|----------------------|------------|----------|
| **AuthModule** | JWT issuance/verify, Google OAuth, sessions in Redis, DPDP consent record | — | CacheModule, Mongo (users) |
| **DataIngestionModule** | Provider adapter interfaces, multi-source fallback chain, circuit breaker, rate-limit handling, data-lineage tagging | CacheModule | External providers, Redis |
| **StocksModule** | Stock schema/repo, orchestrates fetch→score→persist, REST controllers | DataIngestion, Scoring, ScoreHistory, Cache | Mongo (stocks) |
| **FundsModule** | Fund schema/repo, MF fetch→score→persist, REST controllers | DataIngestion, Scoring, ScoreHistory, Cache | Mongo (funds) |
| **ScoringModule** | **Pure** deterministic stock + MF scoring functions. No I/O. Input = data object, output = Score object | — (nothing) | nothing (pure) |
| **ScoreHistoryModule** | Append-only writes + reads of daily scores | — | Mongo time-series |
| **NewsModule** | Fetch/dedupe news, generate + store embeddings, vector queries | DataIngestion, AIModule (embeddings) | Mongo Vector Search |
| **SentimentModule** | Per-article Positive/Negative/Neutral classification | AIModule, NewsModule | (via AIModule) |
| **AIModule** | Gemini *facade*: context-cache mgmt, structured-JSON calls, function-call tool registry (read-only), narrative/SWOT/chat | ComplianceModule | Gemini API, Redis (cache keys) |
| **ComplianceModule** | NestJS interceptor wrapping every AI response: strip BUY/SELL verbs, inject "analysis not advice", attach disclaimer metadata | — | — |
| **SearchModule** | Autocomplete index over stocks + funds | StocksModule, FundsModule | Atlas Search |
| **WatchlistModule** | Watchlist CRUD, daily refresh trigger | StocksModule, FundsModule | Mongo (watchlists) |
| **JobsModule** | BullMQ queues + processors (EOD recompute, news poll, narrative batch) | All domain modules | Redis |
| **CacheModule** | Redis facade, centralised TTL policy table | — | Redis |

---

## The Two Invariant-Protecting Decisions (load-bearing — read first)

### Decision 1 — Gemini function-calling tools are READ-ONLY over precomputed data

The temptation during implementation will be to give Gemini a tool like `computeScore(ticker)`. **Do not.** The AI must never trigger a computation that yields a number; it may only *read* numbers the deterministic Scoring engine has already produced and persisted.

Tool registry exposed to Gemini (all read-only data accessors):

```typescript
// AIModule tool registry — every tool only READS persisted, already-computed data
const tools = {
  getScore:        (ticker) => stocksRepo.getLatestScore(ticker),       // reads stored Score
  getFundamentals: (ticker) => stocksRepo.getFundamentals(ticker),
  getNewsSentiment:(ticker) => sentimentRepo.getAggregate(ticker),
  getHoldings:     (ticker) => stocksRepo.getPromoterHoldings(ticker),
  getScoreHistory: (ticker) => scoreHistoryRepo.range(ticker, '1Y'),
  getFundReturns:  (scheme) => fundsRepo.getReturns(scheme),
};
// There is NO tool that computes anything. AIModule has zero dependency
// on ScoringModule's compute path — only on domain repos' read methods.
```

This makes the deterministic invariant **enforced by construction**: Gemini physically cannot emit a score that was not first computed and stored by the Scoring engine.

### Decision 2 — ComplianceModule is an interceptor, not an optional service

Every AI output (chat token stream, narrative, SWOT bullet, sentiment label) flows through **one chokepoint**. The raw Gemini client is private behind the AIModule facade — there is no code path that calls Gemini without compliance applied.

```typescript
// ComplianceInterceptor wraps every AIModule response
@Injectable()
export class ComplianceInterceptor implements NestInterceptor {
  intercept(ctx, next) {
    return next.handle().pipe(map((aiOutput) => ({
      text: sanitise(aiOutput.text),         // strip "buy"/"sell"/"recommend" verbs → Strong Score / Caution / Weak Score
      disclaimer: STANDARD_DISCLAIMER,        // "analysis not advice"
      pastPerformance: aiOutput.hasReturns ? PAST_PERF_DISCLAIMER : undefined,
      sources: aiOutput.citedSources,         // never un-sourced figures
    })));
  }
}
```

For the streaming chat case, sanitisation runs on the assembled buffer (or per-chunk with a small lookback window) before the SSE chunk reaches the client.

---

## Recommended Project Structure

```
apps/
├── api/                              # NestJS backend
│   └── src/
│       ├── auth/                     # AuthModule — JWT, Google OAuth, DPDP consent
│       ├── data-ingestion/           # adapter layer (see below)
│       │   ├── providers/
│       │   │   ├── provider.interface.ts      # PriceProvider, FundProvider, NewsProvider
│       │   │   ├── yahoo.adapter.ts
│       │   │   ├── mfapi.adapter.ts
│       │   │   ├── amfi.adapter.ts
│       │   │   ├── nse-bse.adapter.ts
│       │   │   └── news-rss.adapter.ts
│       │   ├── fallback-chain.ts              # ordered priority + circuit breaker
│       │   └── data-ingestion.module.ts
│       ├── stocks/                   # schema, repo, controller, fetch→score→persist orchestration
│       ├── funds/                    # parallel to stocks for MF
│       ├── scoring/                  # PURE — no Nest providers with I/O
│       │   ├── stock-scoring.ts      # pillars: Fund 35 / Val 20 / Tech 20 / Sent 10 / Risk 10 / Event 5
│       │   ├── fund-scoring.ts       # Returns / Risk-adj / Consistency / Costs / Manager / Portfolio
│       │   ├── pillars/              # one file per pillar — independently unit-tested
│       │   └── scoring.types.ts      # ScoreInput, Score, PillarBreakdown
│       ├── score-history/            # time-series collection writes/reads
│       ├── news/                     # fetch, dedupe, embeddings, vector query
│       ├── sentiment/                # classification via AIModule
│       ├── ai/                       # Gemini facade
│       │   ├── gemini.client.ts      # PRIVATE — never injected outside AIModule
│       │   ├── ai.service.ts         # public facade: narrative(), swot(), chat(), classify()
│       │   ├── context-cache.ts      # create/bust cached context, keyed by ticker:dataVersion
│       │   ├── tools.registry.ts     # read-only function-calling tools
│       │   └── ai.module.ts
│       ├── compliance/               # interceptor + sanitiser + disclaimer constants
│       ├── search/                   # autocomplete (Atlas Search)
│       ├── watchlist/
│       ├── jobs/                     # BullMQ
│       │   ├── queues/               # eod-recompute, news-poll, narrative-batch
│       │   └── processors/
│       ├── cache/                    # Redis facade + TTL policy table
│       └── common/                   # shared DTOs, guards, filters, data-lineage type
└── web/                              # Next.js 15 App Router
    └── src/app/
        ├── (marketing)/              # landing — static
        ├── stock/[ticker]/page.tsx   # RSC, reads NestJS (cache→Mongo), <2s, structured data
        ├── fund/[scheme]/page.tsx    # RSC
        ├── (app)/                    # auth-gated: dashboard, watchlist, compare
        └── api/                      # thin BFF/proxy only if needed; data authority stays in NestJS
```

### Structure Rationale

- **`scoring/` is a pure library, not an orchestrator.** It takes an already-fetched data object and returns a `Score`. Zero mocks needed to unit-test the core IP. Orchestration (fetch → score → persist) lives in `stocks/` and `funds/`. This is the single most important structural decision after the two invariants.
- **`ai/` hides the raw Gemini client.** `gemini.client.ts` is never exported from the module; only `ai.service.ts` (which is wrapped by the compliance interceptor) is injectable. Makes the compliance invariant impossible to bypass.
- **`data-ingestion/providers/` behind interfaces.** Swapping or adding a source (e.g., a paid feed later) is a new adapter file + a position in the fallback chain — no domain code changes.
- **`jobs/` depends on domain modules, never the reverse.** Domain modules stay synchronously testable; background orchestration is layered on top.

---

## Architectural Patterns

### Pattern 1: Provider Adapter + Fallback Chain (DataIngestionModule)

**What:** Each external source implements a narrow interface (`PriceProvider`, `FundProvider`, `NewsProvider`). A fallback chain tries sources in deterministic priority order; on failure/empty/rate-limit it advances to the next, then serves stale cache as last resort. Every persisted metric carries a **data-lineage** field recording which source produced it.

**When to use:** Always — the free-tier sources (Yahoo, MFAPI, AMFI, NSE/BSE unofficial) are unstable and rate-limited with no SLA.

**Trade-offs:** + Survives source outages, debuggable provenance. − Sources disagree on values; the chain order *is* a business decision (document it), and lineage adds a field to every metric.

```typescript
interface PriceProvider { getQuote(t: string): Promise<Quote | null>; }

class PriceFallbackChain {
  constructor(private providers: PriceProvider[], private cache: CacheService) {}
  async getQuote(t: string): Promise<{ quote: Quote; source: string; stale: boolean }> {
    for (const p of this.providers) {                 // deterministic priority order
      try {
        const q = await p.getQuote(t);
        if (q) { await this.cache.set(`quote:${t}`, q, q.ttl); return { quote: q, source: p.name, stale: false }; }
      } catch (e) { /* circuit breaker trips after N failures; log + continue */ }
    }
    const cached = await this.cache.get(`quote:${t}`); // last resort: stale data, flagged
    if (cached) return { quote: cached, source: 'cache', stale: true };
    throw new DataUnavailableError(t);
  }
}
```

### Pattern 2: Pure Scoring Engine (function core, imperative shell)

**What:** Scoring is a set of pure functions. Side effects (fetch, persist) sit at the boundary in `stocks/`/`funds/`. The pillar weights live in one config object so the IP is auditable and versioned.

**When to use:** This is the core IP and a SEBI-compliance surface — it must be 100% deterministic and unit-tested without mocks.

**Trade-offs:** + Trivially testable, reproducible, auditable. − Requires discipline to keep I/O out of the compute path (enforce via lint/review).

```typescript
const STOCK_WEIGHTS = { fundamentals: 0.35, valuation: 0.20, technical: 0.20,
                        sentiment: 0.10, risk: 0.10, event: 0.05 } as const;

export function scoreStock(input: ScoreInput): Score {           // pure: same input → same output
  const pillars = {
    fundamentals: scoreFundamentals(input.financials),
    valuation:    scoreValuation(input.valuation),
    technical:    scoreTechnical(input.priceHistory),
    sentiment:    scoreSentiment(input.newsAggregate),           // numeric aggregate, NOT Gemini text
    risk:         scoreRisk(input.volatility, input.quality),
    event:        scoreEvent(input.events),
  };
  const composite = Object.entries(STOCK_WEIGHTS)
    .reduce((s, [k, w]) => s + pillars[k] * w, 0);
  return { value: round1to10(composite), pillars, weightsVersion: 'v1', computedAt: input.asOf };
}
```

### Pattern 3: Gemini Facade with Context Cache + Versioned Invalidation

**What:** AIModule wraps the Gemini SDK. Per stock/fund it creates a **context cache** (Gemini explicit caching, configurable TTL — verified: default 60min, no upper bound, so 24h stock / 7d MF is valid) holding the heavy static context (company profile, latest scores, fundamentals). Subsequent narrative/chat calls reference the cache for the ~90% token discount. Structured JSON output (`responseSchema`) is used for SWOT and sentiment so the result is parseable, not free text.

**When to use:** All Gemini calls. Context caching is what makes the AI cost target and the <2s narrative path viable.

**Trade-offs:** + Major cost reduction, fast warm calls. − **TTL alone is not enough:** the nightly recompute changes a stock's numbers, so the cache must be *busted on data change*. Key the cache by `${ticker}:${dataVersionHash}` so a recompute naturally produces a new key and orphans the old cache.

```typescript
async getNarrativeCache(ticker: string, dataVersionHash: string) {
  const key = `gemini-ctx:${ticker}:${dataVersionHash}`;   // version in key = automatic invalidation
  let cacheName = await redis.get(key);
  if (!cacheName) {
    const cache = await gemini.caches.create({               // PRIVATE client, inside facade
      model: 'gemini-flash',
      systemInstruction: COMPLIANCE_SYSTEM_PROMPT,           // "analysis not advice" baked in
      contents: buildStaticContext(ticker),                  // profile + computed scores (numbers come from us)
      ttl: '86400s',                                         // 24h stock / 604800s for MF
    });
    cacheName = cache.name;
    await redis.set(key, cacheName, 'EX', 86400);
  }
  return cacheName;
}
```

### Pattern 4: Materialised Read Path for <2s SEO Render

**What:** Public RSC pages never compute or call Gemini synchronously. They read **Redis (hot) → Mongo (warm)**. All heavy work (scoring, narrative generation, sentiment) is precomputed by BullMQ jobs and persisted. A cache miss falls back to Mongo (still fast); it must **not** trigger Gemini or a fresh score computation in the request path.

**When to use:** Every public report page. This is the only way to hit <2s on 4G.

**Trade-offs:** + Predictable fast renders, cheap. − Data is as fresh as the last job run (acceptable: 15-min-delayed prices, nightly scores, 30-min news). Requires jobs + cache to exist *before* the pages — drives build order.

---

## Data Flow

### Write path (background — populates the materialised store)

```
BullMQ nightly EOD job (~5000 stocks, batched)
    ↓
DataIngestionModule.fallbackChain  → real data + lineage
    ↓
ScoringModule.scoreStock(data)     → deterministic Score (PURE)
    ↓
StocksModule persist  →  Mongo (stocks)  +  ScoreHistoryModule → time-series
    ↓
busts Gemini context cache (new dataVersionHash)  +  enqueues narrative-batch job
    ↓
narrative-batch job → AIModule (Gemini, cached ctx) → ComplianceInterceptor → persist narrative+SWOT
    ↓
warms Redis report cache
```

### Read path (request — public SEO report, <2s)

```
GET /stock/[ticker]  (Next.js RSC)
    ↓  fetch NestJS REST
StocksController
    ↓
Redis report cache  ──hit──→  return (fast path)
    │ miss
    ▼
Mongo (stocks doc + latest score + persisted narrative)   ← NO Gemini, NO recompute here
    ↓
re-warm Redis  →  return
    ↓
RSC renders score + 6 cards + narrative + structured data (JSON-LD)
```

### Chat path (interactive — Ask FinSight)

```
User question (CSR)  →  NestJS chat endpoint (SSE)
    ↓
AIModule.chat(scope, ctx-cache)  → Gemini with READ-ONLY function tools
    ↓  (Gemini calls getScore/getFundamentals/... → repos read PERSISTED numbers)
streamed tokens  →  ComplianceInterceptor (buffered sanitise)  →  SSE chunks → client
```

### Key data flows

1. **Deterministic number flow:** External data → DataIngestion (lineage) → ScoringModule (pure) → Mongo/time-series. Gemini is *never* in this chain.
2. **Narrative flow:** Persisted numbers → AIModule (reads them as context) → Compliance → persisted text. Gemini reads numbers, writes prose.
3. **Cache invalidation flow:** Recompute changes `dataVersionHash` → new Gemini context-cache key + Redis report-cache bust → next read repopulates.

---

## Caching Strategy (centralised TTL policy in CacheModule)

| Cache | Store | TTL | Invalidation |
|-------|-------|-----|--------------|
| Live quote (15-min delayed) | Redis | 15 min | natural expiry |
| Report payload (score+cards+narrative) | Redis | until next recompute | busted by EOD job on `dataVersionHash` change |
| Gemini context cache — stock | Gemini + Redis pointer | 24h | versioned key + nightly recompute |
| Gemini context cache — MF | Gemini + Redis pointer | 7d | versioned key + recompute |
| Search autocomplete | Redis | 1h | on universe update |
| Session / JWT denylist | Redis | session length | on logout |
| News aggregate per ticker | Redis | 30 min | news-poll job |

---

## BullMQ Jobs

| Queue | Schedule | Work | Concurrency notes |
|-------|----------|------|-------------------|
| `eod-recompute` | nightly (post NSE close) | ~5000 stocks: fetch → score → persist → bust caches. Process in **batches/sub-jobs** (fan-out), not one giant job | Rate-limit per provider; respect Yahoo unofficial limits; idempotent per ticker |
| `news-poll` | every 30 min | fetch RSS/NewsData.io, dedupe, embed (Atlas Vector), enqueue sentiment | dedupe by URL hash |
| `narrative-batch` | after recompute + on demand | batched Gemini narrative/SWOT using cached context | Flash/Flash-Lite for volume; backoff on 429 |
| `watchlist-refresh` | daily | refresh scores for watchlisted symbols (subset of eod) | piggybacks on eod results |

Jobs depend on domain modules; domain modules never depend on jobs. EOD recompute must be **idempotent** and **fan-out** (one parent job → N child jobs) so a single failure doesn't block 5000 symbols.

---

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| 0–1k users | Single NestJS instance, single BullMQ worker, Atlas M10. Modular monolith is correct — do not split services. |
| 1k–100k users | Separate **API process** from **worker process** (same codebase, `JobsModule` runs in worker mode). Add Redis read replica for cache. Scale RSC reads horizontally (stateless). |
| 100k+ users | Multiple workers with per-queue concurrency, sharded EOD fan-out. Consider read-only Mongo analytics node for score-history queries. Only then evaluate extracting DataIngestion as a separate service. |

### Scaling priorities

1. **First bottleneck — external provider rate limits during EOD recompute.** Fix with fan-out batching, per-provider throttle, and the fallback chain. This breaks before user load does.
2. **Second bottleneck — Gemini cost/throughput on narrative + chat.** Fix with context caching (90% discount), Flash for volume, and batched generation. Already designed in.
3. **Third — RSC read latency under load.** Stateless RSC + Redis hot path scales horizontally; this is the easy axis.

---

## Anti-Patterns

### Anti-Pattern 1: Letting Gemini compute or "estimate" a number

**What people do:** Expose a `computeScore` / `estimatePE` tool, or accept a figure from Gemini's prose into a stored field.
**Why it's wrong:** Violates the deterministic invariant and SEBI compliance; produces non-reproducible, hallucinated figures.
**Do this instead:** Function tools are read-only accessors over persisted, already-computed data. All numbers originate in ScoringModule (pure). Gemini receives numbers as context and only narrates.

### Anti-Pattern 2: Compliance as a "remember to call it" service

**What people do:** A `sanitise()` helper that controllers call before returning AI text.
**Why it's wrong:** Someone will forget it on a new endpoint or the streaming path — a compliance breach.
**Do this instead:** ComplianceInterceptor wraps the AIModule facade; the raw Gemini client is private. No AI text can leave without sanitisation.

### Anti-Pattern 3: Computing reports/narrative in the request path

**What people do:** On a report-page request, fetch live data, score, and call Gemini synchronously.
**Why it's wrong:** Blows the <2s target, multiplies Gemini cost, and couples render latency to provider/AI latency.
**Do this instead:** Materialise everything via BullMQ; RSC reads Redis→Mongo only. Cache miss falls back to Mongo, never to Gemini.

### Anti-Pattern 4: I/O inside ScoringModule

**What people do:** Have the scorer fetch missing data or read Mongo when a field is absent.
**Why it's wrong:** Destroys testability and determinism; makes the IP unauditable.
**Do this instead:** Keep ScoringModule pure. The orchestrator (stocks/funds) gathers all inputs first, then calls the scorer with a complete `ScoreInput`.

### Anti-Pattern 5: One monolithic 5000-stock EOD job

**What people do:** Loop over all symbols in a single BullMQ job.
**Why it's wrong:** One failure or rate-limit stalls the whole recompute; no retry granularity.
**Do this instead:** Fan-out — parent job enqueues N idempotent per-batch child jobs with per-provider throttling.

---

## Integration Points

### External Services

| Service | Integration pattern | Notes / gotchas |
|---------|---------------------|-----------------|
| Yahoo Finance (`yahoo-finance2`) | Adapter in fallback chain | Unofficial, no SLA, rate-limited; first in price chain. Pin Node LTS (v20/22/24). |
| MFAPI.in | Adapter (FundProvider) | NAV/scheme data; free, community-run — cache aggressively. |
| AMFI | Adapter (FundProvider) | Authoritative NAV daily file; good as primary MF source, MFAPI as supplement. |
| NSE/BSE unofficial | Adapter (PriceProvider supplement) | Fragile, blocks scrapers; supplement only, low in chain. |
| News RSS / NewsData.io | NewsProvider adapter | Free tier limits; dedupe by URL hash; 30-min poll. |
| Google Gemini | AIModule facade (private client) | Explicit context caching (TTL configurable, default 60min, no upper bound — 24h/7d valid). Structured JSON output + read-only function calling. Flash/Flash-Lite for volume, 2.5 Pro for deep reasoning. |
| MongoDB **Atlas** | Mongoose + Atlas Search + Vector Search | Vector/Atlas Search require Atlas, NOT self-hosted. Deploy Atlas in ap-south-1 (Mumbai) for DPDP residency. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Next.js ↔ NestJS | HTTPS REST (reads) + SSE (chat) | NestJS is the sole data authority; web has no direct DB access. |
| Stocks/Funds → Scoring | Direct in-process call (pure fn) | No I/O across this boundary — orchestrator passes a complete `ScoreInput`. |
| AIModule → ComplianceModule | NestJS interceptor | Enforced chokepoint; raw Gemini client never exposed. |
| AIModule → domain repos | Read-only function-call tools | Tools only read persisted data; no compute, no writes. |
| JobsModule → domain modules | Direct calls in worker process | Domain never depends on jobs. |
| Domain → DataIngestion | Through fallback chain | Domain code never touches a provider SDK directly. |

---

## Suggested Build Order (dependency graph)

> Rationale: Scoring + Jobs + Cache must exist **before** any user-facing page, because the <2s SEO target requires *materialised* data. AI comes **after** scoring so the deterministic invariant is enforced by construction — Gemini cannot reference a score that has not yet been computed and stored.

```
1.  Scaffold        NestJS app + Mongo (Atlas) conn + Redis + CacheModule + AuthModule
        ↓
2.  DataIngestion   Provider interface + Yahoo adapter + fallback-chain shape + lineage
        ↓
3.  Schemas/Repos   Stock + Fund schemas & repos (no AI, no scoring)
        ↓
4.  ScoringModule   PURE stock + MF scoring — TDD this (the IP). No I/O.
        ↓
5.  ScoreHistory    Time-series collection writes/reads
        ↓
6.  JobsModule      BullMQ + first job: nightly EOD recompute (fan-out, idempotent)
        ↓
7.  More adapters   MFAPI, AMFI, NSE/BSE into the chain
        ↓
8.  NewsModule      news fetch/dedupe/embeddings + news-poll job (Atlas Vector)
        ↓
9.  Compliance+AI   ComplianceModule interceptor + AIModule (Gemini facade, ctx cache)
        ↓
10. Sentiment       SentimentModule via AIModule
        ↓
11. Narrative job   batched Gemini narrative/SWOT generation
        ↓
12. Search+Watchlist  autocomplete (Atlas Search) + watchlist CRUD/refresh
        ↓
13. Public SEO      Next.js RSC /stock/[t] /fund/[s] — read cache→Mongo, JSON-LD, <2s
        ↓
14. App shell+Auth  auth-gated dashboard
        ↓
15. Ask FinSight    chat (SSE) with read-only function-call tools
        ↓
16. Comparison      2–3 way stock/fund compare with AI verdict
```

**Build-order implications for the roadmap:**
- Steps 1–6 are *infrastructure + IP*: no user-visible features yet, but everything downstream depends on them. Phase 1 should cluster these.
- The **cache + jobs (6) precede SEO pages (13)** — this is non-negotiable for the perf target and should be an explicit phase dependency.
- **Compliance (9) ships with AI (9), never after** — the interceptor is a precondition for any Gemini call, not a follow-up hardening task.
- Scoring (4) is the highest-risk/highest-value unit and should get dedicated, test-heavy attention early — flag it for deeper research if pillar formulas are underspecified.

---

## Sources

- Gemini context caching, TTL, structured output, Node SDK — https://ai.google.dev/gemini-api/docs/caching and https://ai.google.dev/api/caching (HIGH — official docs)
- MongoDB time-series limitations (no change streams, 4MB doc cap) — https://www.mongodb.com/docs/manual/core/timeseries/timeseries-limitations/ (HIGH)
- MongoDB Vector Search overview (≤8192-dim, Atlas requirement) — https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/ (HIGH)
- Atlas Search compatibility/limitations — https://www.mongodb.com/docs/atlas/atlas-search/about/feature-compatibility/ (HIGH)
- yahoo-finance2 (unofficial, no SLA, Node LTS support) — https://github.com/gadicc/yahoo-finance2 (MEDIUM)
- Project context — `.planning/PROJECT.md` (HIGH — authoritative source of constraints/invariants)

---
*Architecture research for: AI investment-research web app (FinSight AI)*
*Researched: 2026-05-27*
