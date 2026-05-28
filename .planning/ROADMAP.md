# Roadmap: FinSight AI

**Created:** 2026-05-27
**Granularity:** fine (9 phases)
**Core Value:** Plain-English score, verdict, and reasoning for any Indian stock or mutual fund — rendered in under 2 seconds.

Phase structure follows the hard dependency graph from research: infrastructure + IP first (no user-facing features until the materialised store exists), AI surfaces after the deterministic scoring engine so the "Gemini never generates a number" invariant is enforced by construction, and the deepest-dependency feature (Ask FinSight chat) last.

## Phases

- [ ] **Phase 1: Foundation, Auth & Compliance Contract** - Running monorepo, Atlas + Redis, end-to-end auth with DPDP consent, cache facade, verdict enum
- [ ] **Phase 2: Data Ingestion & Instrument Master** - Provider adapters, fallback chain, schema validation, canonical instrument master, adjusted price series
- [ ] **Phase 3: Scoring Engine & Nightly Recompute** - Pure deterministic stock + fund scoring, pillar breakdowns, score history, EOD BullMQ job
- [ ] **Phase 4: Reports, AI Narrative & Active Compliance** - Stock + MF reports, six insight cards, precomputed Gemini summary, active compliance interceptor, <2s read path
- [ ] **Phase 5: Search & Watchlist** - Atlas Search autocomplete, watchlist CRUD with daily-refreshed scores
- [ ] **Phase 6: News Feed & Sentiment** - Per-stock news, AI sentiment tags, vector index, sentiment pillar wired into scoring
- [ ] **Phase 7: Ask FinSight Chat & Comparison** - SSE chat with read-only function calling, streaming compliance, refusals, history, 2-3 way comparison verdict
- [ ] **Phase 8: Public SEO Pages** - Server-rendered indexable per-stock/per-fund pages, JSON-LD, materialised reads
- [ ] **Phase 9: Marketing Landing Page** - Public responsive landing with value prop, pricing teaser, sign-up CTA

## Phase Details

### Phase 1: Foundation, Auth & Compliance Contract
**Goal**: A running monorepo where web and API talk to each other, persistence and caching are wired with health checks, users can fully authenticate with DPDP consent, and the compliance verdict contract exists at the data layer from day one.
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, COMP-01
**Success Criteria** (what must be TRUE):
  1. A developer can run the Turborepo monorepo locally and the Next.js web app successfully calls the NestJS API (shared DTOs from `packages/shared` consumed by both).
  2. The API reports healthy connections to MongoDB Atlas (ap-south-1) and Redis; no secret is hardcoded — all load from environment/secret manager.
  3. A user can sign up and log in with email/password and with Google OAuth, stays logged in across refreshes (JWT session), and can log out from any page.
  4. A new user's first sign-up records a timestamped DPDP consent artifact.
  5. The verdict type is a typed enum (`STRONG_SCORE | CAUTION | WEAK_SCORE`) with no BUY/SELL/HOLD verbs anywhere, and every Redis cache key carries a TTL.
**Plans**: TBD
**UI hint**: yes

### Phase 2: Data Ingestion & Instrument Master
**Goal**: Real free-tier market data flows into the system reliably — through a common provider interface with multi-source fallback, schema-validated at ingestion, normalised for Indian-market quirks, and cached.
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. A canonical instrument master resolves each stock across NSE/BSE/Yahoo symbols and each fund to its AMFI scheme code, so a lookup returns the correct single instrument.
  2. Provider adapters fetch stock prices/fundamentals (Yahoo), MF NAV (MFAPI/AMFI), and news (RSS/NewsData) behind one common interface — no domain code touches a provider SDK directly.
  3. When a primary source is killed in staging, the fallback chain + circuit breaker serves stale-but-labeled data instead of failing or blanking.
  4. A malformed external payload is rejected at ingestion (schema validation) rather than persisted as garbage.
  5. Price history is stored split/corporate-action adjusted using a market-holiday calendar — a known recent split shows no fake price gap.
**Plans**: TBD

### Phase 3: Scoring Engine & Nightly Recompute
**Goal**: The core IP — a pure, deterministic, explainable scoring engine for stocks and funds — produces reproducible 1–10 scores and persists time-stamped history via a nightly batch job.
**Depends on**: Phase 2
**Requirements**: SCORE-01, SCORE-02, SCORE-03, SCORE-04, SCORE-05
**Success Criteria** (what must be TRUE):
  1. A pure (zero-I/O) function computes a deterministic 1–10 FinSight Score for any stock from its six weighted pillars, with a graceful neutral fallback for the Sentiment pillar (so it runs before news exists).
  2. A pure function computes a deterministic 1–10 Fund Score for any mutual fund from its parallel framework.
  3. Each score exposes its full pillar/sub-factor breakdown for explainability ("why is this a 7?").
  4. A nightly BullMQ job recomputes scores for all tracked instruments (fan-out, idempotent) and writes time-stamped score history.
  5. The same instrument produces an identical score given identical inputs (determinism snapshot tests pass).
**Plans**: TBD
**Needs phase research**: yes — pillar sub-formulas (metric selection, normalisation, peer selection, NAV timing) are underspecified in the PRD. Resolve via `/gsd-research-phase` before TDD.

### Phase 4: Reports, AI Narrative & Active Compliance
**Goal**: Users can view full stock and mutual-fund reports — score, verdict, six insight cards, charts, strips, peers, precomputed AI narrative — rendered fast from materialised data, with the compliance interceptor actively sanitising every AI surface.
**Depends on**: Phase 3
**Requirements**: STOCK-01, STOCK-02, STOCK-03, STOCK-04, STOCK-05, STOCK-06, STOCK-08, FUND-01, FUND-02, FUND-03, FUND-04, FUND-05, COMP-02, COMP-03, COMP-04
**Success Criteria** (what must be TRUE):
  1. A user can view a stock report with the FinSight Score gauge, worded verdict, six insight cards (Score, Volatility, Profit Consistency, Event Sensitivity, SWOT, Promoter Holdings), an interactive price chart (1D–MAX), a fundamentals strip, a technicals strip, and peer comparison against 3 competitors.
  2. A user can view a mutual-fund report with the Fund Score, verdict, returns vs benchmark vs category (1/3/5/10y), risk metrics, top-10 holdings/sector/expense/AUM/manager tenure, 3 peer funds, and a "Better Alternatives" card when the score is below 6.
  3. The full report renders in under 2 seconds on 4G via a materialised read path (Redis → Mongo) with no live AI call.
  4. Every AI-generated output (narrative, SWOT) passes through the single compliance interceptor before reaching the client, and the one-paragraph summary is precomputed via the narrative batch job.
  5. Every report and returns view shows the "analysis not advice" + "past performance" disclaimers, and narrative numbers are template-inserted and pass a post-generation numeric audit (no invented figures).
**Plans**: TBD
**UI hint**: yes

### Phase 5: Search & Watchlist
**Goal**: Users can find any instrument via fast autocomplete and curate a personal watchlist whose scores refresh daily.
**Depends on**: Phase 4
**Requirements**: SRCH-01, WATCH-01, WATCH-02
**Success Criteria** (what must be TRUE):
  1. A user can search stocks and funds with autocomplete (name + symbol, current price/NAV) backed by Atlas Search.
  2. A user can add and remove stocks/funds from a personal watchlist.
  3. Watchlist items show a daily-refreshed score sourced from the EOD job.
**Plans:** 2 plans
Plans:
- [ ] 05-PLAN-01-search.md — Atlas Search index (Mongoose Schema.searchIndex) + autocomplete API + cmdk UI (SRCH-01)
- [ ] 05-PLAN-02-watchlist.md — Watchlist Mongo schema + API + page UI + Redis score join with +/- indicator (WATCH-01, WATCH-02)
**UI hint**: yes

### Phase 6: News Feed & Sentiment
**Goal**: Each stock report shows the latest news with AI sentiment tags, news embeddings are semantically indexed, and the sentiment signal feeds back into the scoring engine's Sentiment pillar.
**Depends on**: Phase 4 (active compliance interceptor + AIModule), Phase 3 (scoring sentiment pillar)
**Requirements**: NEWS-01, NEWS-02, NEWS-03, NEWS-04
**Success Criteria** (what must be TRUE):
  1. A user can see the latest news items for a stock on its report.
  2. Each news item shows an AI sentiment tag (Positive / Negative / Neutral) that passed the compliance interceptor.
  3. News article embeddings (gemini-embedding-001 @ 768 dims) are indexed in Atlas Vector Search for semantic retrieval.
  4. The aggregated news sentiment score feeds the Sentiment pillar of the stock scoring engine (replacing the neutral fallback).
**Plans**: TBD
**UI hint**: yes

### Phase 7: Ask FinSight Chat & Comparison
**Goal**: Users can have a streamed, compliance-safe conversation about a stock/fund/portfolio using read-only data tools, review past chats, and compare 2–3 instruments with an AI verdict on the higher-scoring pick.
**Depends on**: Phase 6 (news/sentiment data), Phase 4 (reports + compliance), Phase 3 (scores)
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, STOCK-07
**Success Criteria** (what must be TRUE):
  1. A user can ask a free-text question about a stock, fund, or comparison and receive a streamed (SSE) AI answer.
  2. The chat answers using read-only function-calling tools over persisted data — it never computes or invents numbers — and every answer cites its data source and passes the (streaming) compliance interceptor.
  3. The chat refuses out-of-scope or non-compliant queries (insider trading, US stocks, crypto, guaranteed-return claims).
  4. A user can view their past chat conversations.
  5. A user can compare 2–3 stocks side by side and see an AI verdict naming the higher-scoring pick (never "buy").
**Plans**: TBD
**Needs phase research**: yes — chat guardrails (prompt-injection defence, out-of-scope refusal, citation grounding, SEBI-safe templating, SSE sanitisation) are MEDIUM confidence. Resolve via `/gsd-research-phase` before planning.
**UI hint**: yes

### Phase 8: Public SEO Pages
**Goal**: Every stock and fund has a public, server-rendered, indexable page that reads from the materialised store, carries structured data and compliance disclaimers, and serves complete HTML to crawlers.
**Depends on**: Phase 4 (materialised reports), Phase 6 (news/sentiment content)
**Requirements**: SEO-01, SEO-02, SEO-03, SEO-04
**Success Criteria** (what must be TRUE):
  1. Each stock has a public server-rendered page (`/stock/[ticker]`) and each fund (`/fund/[schemeCode]`) with full HTML content visible in view-source.
  2. Public pages emit JSON-LD structured data, canonical URLs, and OG/Twitter cards.
  3. Public pages read from the materialised store (no live Gemini call on page load) and carry the analysis-not-advice + past-performance disclaimers.
**Plans**: TBD
**UI hint**: yes

### Phase 9: Marketing Landing Page
**Goal**: A public landing page communicates the value proposition and drives sign-ups, fully responsive across devices.
**Depends on**: Phase 1 (auth/sign-up flow to link the CTA to)
**Requirements**: LAND-01, LAND-02
**Success Criteria** (what must be TRUE):
  1. A public landing page communicates the value prop, a pricing teaser, and a clear CTA to sign up.
  2. The landing page renders correctly and is fully responsive across mobile and desktop.
**Plans**: 1 plan
- [ ] 09-01-PLAN.md — Landing page sections + analytics + OG/JSON-LD + copy-compliance Vitest test + Lighthouse + axe-core CI
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation, Auth & Compliance Contract | 0/0 | Not started | - |
| 2. Data Ingestion & Instrument Master | 0/0 | Not started | - |
| 3. Scoring Engine & Nightly Recompute | 0/0 | Not started | - |
| 4. Reports, AI Narrative & Active Compliance | 0/0 | Not started | - |
| 5. Search & Watchlist | 0/2 | Planned | - |
| 6. News Feed & Sentiment | 0/0 | Not started | - |
| 7. Ask FinSight Chat & Comparison | 0/0 | Not started | - |
| 8. Public SEO Pages | 0/0 | Not started | - |
| 9. Marketing Landing Page | 0/1 | Not started | - |

## Coverage

- v1 requirements: 55 total (note: REQUIREMENTS.md headline said "45"; the enumerated REQ-IDs total 55 — see correction note in REQUIREMENTS.md traceability)
- Mapped to phases: 55/55
- Unmapped: 0
- All v1 requirements mapped to exactly one phase. No orphans, no duplicates.

---
*Roadmap created: 2026-05-27*
