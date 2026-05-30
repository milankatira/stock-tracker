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
**Plans**: 4 plans
- [x] 01-01-PLAN.md — Turborepo monorepo + apps scaffold + Wave-0 test infrastructure (FOUND-01, FOUND-03)
- [ ] 01-02-PLAN.md — NestJS API infra: Zod env validation, required-TTL cache facade, split health checks (FOUND-02, FOUND-04, FOUND-05)
- [ ] 01-03-PLAN.md — Auth (email/password + Google OAuth + JWT rotation) + DPDP consent (AUTH-01..05)
- [ ] 01-04-PLAN.md — Compliance verdict contract: branded `Verdict` type + `forbid-verbs.sh` CI guard (COMP-01)
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
**Plans**: 3 plans
Plans:
- [ ] 02-01-PLAN.md — Provider ports (`PriceProvider`/`FundProvider`/`NewsProvider`) + Yahoo + NSE stock adapters + Wave-0 test infra (Jest + mongodb-memory-server + nock + ESLint architecture fence) (DATA-02 stocks, DATA-04 stocks)
- [ ] 02-02-PLAN.md — MF NAV adapters (MFAPI.in primary + AMFI NAVAll.txt fallback parser) + News adapters (MoneyControl/ET RSS + NewsData.io supplement) (DATA-02 MF + news, DATA-04 MF + news)
- [ ] 02-03-PLAN.md — Canonical Instrument + Fund schemas (`popularity` cross-phase contract) + monthly seed job + MongoDB time-series `price_history` + `nav_history` + corporate-action adjustment service + NSE holiday calendar (2026 + 2027 incl. Muhurat session) + per-provider-per-method `opossum 9` circuit breakers + TTL-enforced stale-cache + three fallback chain services + `TickerTaggerService` + final DI rebinding (DATA-01, DATA-03, DATA-05)

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
**Plans**: 3 plans
Plans:
- [ ] 03-01-PLAN.md — Pure stock scoring engine (scoreStock + 6 pillars + TDD: Vitest snapshots over 10 fixtures + fast-check properties + CI matrix Node 20/22)
- [ ] 03-02-PLAN.md — Pure fund scoring engine (scoreFund + 6 pillars + returns/Sharpe/Sortino math + TDD over 5 direct/growth fixtures)
- [ ] 03-03-PLAN.md — Score-history time-series collection + BullMQ EOD recompute (upsertJobScheduler + addBulk fan-out + jobId idempotency) + Redis score:latest/prev materialisation + admin recompute endpoint
**Needs phase research**: completed — see 03-RESEARCH.md (pillar sub-formulas locked with 12 [ASSUMED] items pending optional /gsd-discuss-phase confirmation).

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
**Plans**: 5 plans
Plans:
- [ ] 04-01-PLAN.md — AIModule + class-scoped ComplianceInterceptor + private Gemini client + ESLint architecture rule + sanitiser/audit/template-slot libraries (COMP-02, COMP-04 foundation)
- [ ] 04-02-PLAN.md — Narrative-batch BullMQ job + versioned cache key + structured Gemini output + audit retry + deterministic fallback (COMP-04 finalisation)
- [ ] 04-03-PLAN.md — Stock report API + ReportDoc Mongo schema + Redis hot cache + peer-set fallback + k6 perf gate (STOCK-01..06, STOCK-08, COMP-03)
- [ ] 04-04-PLAN.md — Stock report Next.js page (RSC + Suspense streaming) + 11 report components + PriceChart v5 + revalidate webhook receiver (STOCK-01..05 UI)
- [ ] 04-05-PLAN.md — MF report API + page + fund narrative-batch + "Higher-scoring peers" card (FUND-01..05)
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
**Plans**: 2 plans
Plans:
- [x] 06-01-PLAN.md — News ingestion pipeline: RSS + NewsData.io adapters, dedup, ticker-tagger (with Adani over-attribution fix), News schema, Atlas Vector Search index + boot dim-assertion, BullMQ news-poll job, GET /stocks/:ticker/news (NEWS-01)
- [x] 06-02-PLAN.md — Embeddings (gemini-embedding-001 @ 768) + Atlas $vectorSearch + Gemini sentiment classification via AIModule + ComplianceInterceptor + pure aggregator (TDD) + sentiment-pillar wire-up to ScoringModule + frontend news feed on stock report (NEWS-02, NEWS-03, NEWS-04)
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
**Plans**: 4 plans
Plans:
- [x] 07-PLAN-01-spike-tools.md — Wave-0 spike verifying @google/genai 2.6 streaming + function-calling chunk shape; typed read-only TOOL_REGISTRY (7 tools: getInstrumentScore, getInstrumentFundamentals, getInstrumentTechnicals, getFundReturns, getRecentNews, comparePeers, searchInstruments); CI lint blocking any scoring/ import under ai/tools/** (CHAT-02)
- [x] 07-PLAN-02-sse-streaming.md — SentenceBuffer FSM (OUT/IN_NUMBER/IN_ABBREV) + forbidden-verbs + RefusalCategory enum + pre-stream RefusalDetector; AIService.chatStream Gemini streaming + function-calling loop with N=5 tool cap + 15s heartbeats + AbortController; NestJS @Sse controller + ChatService + @nestjs/throttler (CHAT-01, CHAT-03 partial, CHAT-04)
- [ ] 07-PLAN-03-history-ui.md — Citation validator (Indian numeric regex) + ChatSession Mongoose schema + ChatSessionRepo (per-user CRUD with TS-enforced userId) + ChatOwnershipGuard + REST endpoints + idempotent reconnect via messageId; Next.js chat UI (past conversations, thread view, scope picker, citation pills, tool breadcrumbs, refusal banners) using @microsoft/fetch-event-source (CHAT-05, CHAT-03 finalisation)
- [ ] 07-PLAN-04-comparison.md — STOCK-07 comparison: separate compare.controller.ts/compare.service.ts (no Plan 03 file conflict); AIService.compare one-shot non-streaming generateContent with responseJsonSchema { winnerSymbol, rationale, scoreDelta }; server-side scoreDelta override (Gemini's number discarded — invariant); 422 SCORE_PENDING handling; Next.js compare picker + VerdictCard + ScoreTable (STOCK-07)
**Needs phase research**: closed — see `.planning/phases/07-ask-finsight-chat-comparison/07-RESEARCH.md`
**UI hint**: yes

### Phase 8: Public SEO Pages
**Goal**: Every stock and fund has a public, server-rendered, indexable page that reads from the materialised store, carries structured data and compliance disclaimers, and serves complete HTML to crawlers.
**Depends on**: Phase 4 (materialised reports), Phase 6 (news/sentiment content)
**Requirements**: SEO-01, SEO-02, SEO-03, SEO-04
**Success Criteria** (what must be TRUE):
  1. Each stock has a public server-rendered page (`/stock/[ticker]`) and each fund (`/fund/[schemeCode]`) with full HTML content visible in view-source.
  2. Public pages emit JSON-LD structured data, canonical URLs, and OG/Twitter cards.
  3. Public pages read from the materialised store (no live Gemini call on page load) and carry the analysis-not-advice + past-performance disclaimers.
**Plans**: 2 plans
Plans:
- [ ] 08-PLAN-01-public-pages.md — RSC pages /stock/[ticker] + /fund/[schemeCode] with generateStaticParams (NIFTY 500 + top funds) + dynamicParams=true + revalidate=86400; generateMetadata (canonical NSE-preferred, OG, Twitter, robots:{index:false} on stubs); inline JSON-LD (Corporation/FinancialProduct + Article + BreadcrumbList — NO Review/Rating); Disclaimers SC; three-layer Gemini ban (ESLint no-restricted-imports + CI grep + Vitest mock-throw); long-tail stub UX with ad-hoc compute enqueue (SEO-01, SEO-02, SEO-03 page-level, SEO-04)
- [ ] 08-PLAN-02-sitemap-og-webhook.md — sitemap.ts (with generateSitemaps for 50k cap) + robots.ts; opengraph-image.tsx per ticker + per fund (next/og ImageResponse, Edge runtime) + static brand fallback; HMAC SHA-256 + timingSafeEqual /api/revalidate Route Handler (TDD); cross-phase wiring of RevalidateWebhookClient into Phase 3 eod-recompute + Phase 4 narrative-batch jobs (SEO-03 finalisation)
**Needs phase research**: closed — see `.planning/phases/08-public-seo-pages/08-RESEARCH.md`
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
| 1. Foundation, Auth & Compliance Contract | 0/4 | Planned | - |
| 2. Data Ingestion & Instrument Master | 0/3 | Planned | - |
| 3. Scoring Engine & Nightly Recompute | 0/3 | Planned | - |
| 4. Reports, AI Narrative & Active Compliance | 0/5 | Not started | - |
| 5. Search & Watchlist | 0/2 | Planned | - |
| 6. News Feed & Sentiment | 0/2 | Not started | - |
| 7. Ask FinSight Chat & Comparison | 0/4 | Planned | - |
| 8. Public SEO Pages | 0/2 | Planned | - |
| 9. Marketing Landing Page | 0/1 | Not started | - |

## Coverage

- v1 requirements: 55 total (note: REQUIREMENTS.md headline said "45"; the enumerated REQ-IDs total 55 — see correction note in REQUIREMENTS.md traceability)
- Mapped to phases: 55/55
- Unmapped: 0
- All v1 requirements mapped to exactly one phase. No orphans, no duplicates.

---
*Roadmap created: 2026-05-27*
