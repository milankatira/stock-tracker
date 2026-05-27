# Requirements: FinSight AI

**Defined:** 2026-05-27
**Core Value:** Plain-English score, verdict, and reasoning for any Indian stock or mutual fund — rendered in under 2 seconds.

## v1 Requirements

Requirements for the initial release. Each maps to a roadmap phase.

### Foundation & Infrastructure

- [ ] **FOUND-01**: A running Turborepo monorepo hosts a Next.js 15 web app and a NestJS API that can call each other
- [ ] **FOUND-02**: The API connects to MongoDB Atlas (ap-south-1) and Redis, with health checks passing
- [ ] **FOUND-03**: Shared TypeScript DTOs/types in `packages/shared` are consumed by both web and API
- [ ] **FOUND-04**: Secrets (Gemini key, Mongo URI, OAuth creds) load from environment/secret manager — never hardcoded
- [ ] **FOUND-05**: A centralised Redis cache facade enforces a TTL on every cache key

### Authentication

- [ ] **AUTH-01**: User can sign up with email and password
- [ ] **AUTH-02**: User can log in with email and password and stays logged in across refreshes (JWT session)
- [ ] **AUTH-03**: User can sign up / log in with Google OAuth
- [ ] **AUTH-04**: User can log out from any page
- [ ] **AUTH-05**: User gives DPDP-compliant consent (timestamped record) on first sign-up

### Compliance

- [ ] **COMP-01**: Every verdict is a typed enum (`STRONG_SCORE | CAUTION | WEAK_SCORE`) — no BUY/SELL/HOLD verbs anywhere
- [ ] **COMP-02**: Every AI-generated output passes through a single compliance interceptor before reaching the client
- [ ] **COMP-03**: Every report and returns view shows the "analysis not advice" + "past performance" disclaimers
- [ ] **COMP-04**: AI narrative numbers are template-inserted and pass a post-generation numeric audit (no paraphrased/invented figures)

### Data Ingestion

- [ ] **DATA-01**: A canonical instrument master maps each stock across NSE/BSE/Yahoo symbols and each fund to its AMFI scheme code
- [ ] **DATA-02**: Provider adapters fetch stock prices/fundamentals (Yahoo), MF NAV (MFAPI/AMFI), and news (RSS/NewsData) behind a common interface
- [ ] **DATA-03**: A multi-source fallback chain with circuit breaker serves stale-but-labeled data instead of failing when a source is down
- [ ] **DATA-04**: Every external payload is schema-validated at ingestion before persistence
- [ ] **DATA-05**: Price history is stored adjusted for splits/corporate actions, using a market-holiday calendar

### Scoring Engine

- [ ] **SCORE-01**: A pure (zero-I/O) function computes a deterministic 1–10 FinSight Score for any stock from its six weighted pillars
- [ ] **SCORE-02**: A pure function computes a deterministic 1–10 Fund Score for any mutual fund from its parallel framework
- [ ] **SCORE-03**: Each score exposes its full pillar/sub-factor breakdown for explainability
- [ ] **SCORE-04**: A nightly BullMQ job recomputes scores for all tracked instruments and writes time-stamped score history
- [ ] **SCORE-05**: The same instrument produces an identical score given identical inputs (determinism tests)

### Stock Report

- [ ] **STOCK-01**: User can view a stock report with the FinSight Score gauge, worded verdict, and a precomputed one-paragraph AI summary
- [ ] **STOCK-02**: The report shows the six insight cards (Score, Volatility, Profit Consistency, Event Sensitivity, SWOT, Promoter Holdings)
- [ ] **STOCK-03**: The report shows an interactive price chart (1D/1W/1M/6M/1Y/5Y/MAX)
- [ ] **STOCK-04**: The report shows a fundamentals strip (P/E, P/B, ROE, ROCE, Debt/Equity, Market Cap)
- [ ] **STOCK-05**: The report shows a technicals strip (RSI, MACD signal, 50/200 DMA, Beta)
- [ ] **STOCK-06**: The report shows peer comparison against 3 closest competitors with their scores
- [ ] **STOCK-07**: User can compare 2–3 stocks side by side with an AI verdict on the higher-scoring pick
- [ ] **STOCK-08**: The full report renders in under 2 seconds on a 4G connection (materialised read path, no live AI call)

### Mutual Fund Report

- [ ] **FUND-01**: User can view a fund report with the Fund Score, worded verdict, and precomputed AI summary
- [ ] **FUND-02**: The report shows returns vs benchmark vs category over 1/3/5/10 years
- [ ] **FUND-03**: The report shows risk metrics (Sharpe, standard deviation, max drawdown)
- [ ] **FUND-04**: The report shows top-10 holdings, sector allocation, expense ratio, AUM, and manager tenure
- [ ] **FUND-05**: The report shows 3 peer funds with scores, and a "Better Alternatives" card when the score is below 6

### Search & Watchlist

- [ ] **SRCH-01**: User can search stocks and funds with autocomplete (name + symbol, current price/NAV) via Atlas Search
- [ ] **WATCH-01**: User can add and remove stocks/funds from a personal watchlist
- [ ] **WATCH-02**: Watchlist items show a daily-refreshed score

### News & Sentiment

- [ ] **NEWS-01**: User can see the latest news items for a stock on its report
- [ ] **NEWS-02**: Each news item shows an AI sentiment tag (Positive / Negative / Neutral)
- [ ] **NEWS-03**: News article embeddings are indexed in Atlas Vector Search for semantic retrieval
- [ ] **NEWS-04**: The news sentiment score feeds the Sentiment pillar of the stock scoring engine

### Ask FinSight (Conversational AI)

- [ ] **CHAT-01**: User can ask free-text questions about a stock, fund, or comparison and get a streamed (SSE) AI answer
- [ ] **CHAT-02**: The chat uses read-only function-calling tools over persisted data — it never computes or invents numbers
- [ ] **CHAT-03**: Chat answers cite their data source and pass the compliance interceptor (incl. streaming)
- [ ] **CHAT-04**: The chat refuses out-of-scope or non-compliant queries (insider trading, US stocks, crypto, guaranteed-return claims)
- [ ] **CHAT-05**: User can view their past chat conversations

### Public SEO Pages

- [ ] **SEO-01**: Each stock has a public, server-rendered, indexable page (`/stock/[ticker]`) with full HTML content in view-source
- [ ] **SEO-02**: Each fund has a public, server-rendered, indexable page (`/fund/[schemeCode]`)
- [ ] **SEO-03**: Public pages emit JSON-LD structured data, canonical URLs, and OG/Twitter cards
- [ ] **SEO-04**: Public pages read from the materialised store (no live Gemini call on page load) and carry compliance disclaimers

### Marketing Landing Page

- [ ] **LAND-01**: A public landing page communicates the value prop, a pricing teaser, and a CTA to sign up
- [ ] **LAND-02**: The landing page is fully responsive across mobile and desktop

## v2 Requirements

Deferred to a future milestone. Tracked, not in the current roadmap.

### Portfolio
- **PORT-01**: Read-only portfolio sync via broker OAuth (Zerodha, Groww, Upstox, Angel One)
- **PORT-02**: CAS PDF import for mutual fund holdings
- **PORT-03**: Overall portfolio health score with rebalance suggestions
- **PORT-04**: Risk-profile questionnaire feeding personalised score weighting
- **PORT-05**: AI portfolio builder from goal + risk + amount

### Engagement & Monetisation
- **ALERT-01**: Smart push/email alerts on price targets, score changes, and breaking news
- **PAY-01**: Pro/Premium subscription tiers via Razorpay (UPI Autopay)

### Expansion
- **IPO-01**: Live IPO list with AI "worth it / skip" verdicts
- **SCRN-01**: AI prompt-based screener ("breakout stocks under ₹500")
- **LANG-01**: Reports and chat in Hindi/Marathi/Gujarati/Tamil

## Out of Scope

Explicitly excluded for this milestone. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Native mobile apps (React Native, iOS/Android) | Web-first for speed + SEO; native is a future milestone |
| Real-time / sub-minute tick data | Needs paid/licensed feeds; free 15-min-delayed data for v1 |
| Branded BUY/SELL recommendations | Legally gated behind SEBI RA registration |
| Order placement / "open in broker" deep links | Execution is out of scope; research-only product |
| AMFI ARN / direct MF distribution | Requires ARN registration; revenue milestone |
| F&O module, goal planner, tax/capital-gains reports | PRD V3 — beyond MVP value loop |
| Self-hosted Community MongoDB | Atlas Vector Search + Atlas Search are Atlas-only; use Atlas in ap-south-1 |

## Traceability

Populated during roadmap creation — each requirement maps to exactly one phase.

> **Count correction:** The "v1 Requirements" headline previously read "45 total," but the enumerated REQ-IDs in this document total **55**. The roadmap maps all 55. Counts below reflect the accurate enumeration.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| FOUND-05 | Phase 1 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| COMP-01 | Phase 1 | Pending |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| DATA-04 | Phase 2 | Pending |
| DATA-05 | Phase 2 | Pending |
| SCORE-01 | Phase 3 | Pending |
| SCORE-02 | Phase 3 | Pending |
| SCORE-03 | Phase 3 | Pending |
| SCORE-04 | Phase 3 | Pending |
| SCORE-05 | Phase 3 | Pending |
| STOCK-01 | Phase 4 | Pending |
| STOCK-02 | Phase 4 | Pending |
| STOCK-03 | Phase 4 | Pending |
| STOCK-04 | Phase 4 | Pending |
| STOCK-05 | Phase 4 | Pending |
| STOCK-06 | Phase 4 | Pending |
| STOCK-08 | Phase 4 | Pending |
| FUND-01 | Phase 4 | Pending |
| FUND-02 | Phase 4 | Pending |
| FUND-03 | Phase 4 | Pending |
| FUND-04 | Phase 4 | Pending |
| FUND-05 | Phase 4 | Pending |
| COMP-02 | Phase 4 | Pending |
| COMP-03 | Phase 4 | Pending |
| COMP-04 | Phase 4 | Pending |
| SRCH-01 | Phase 5 | Pending |
| WATCH-01 | Phase 5 | Pending |
| WATCH-02 | Phase 5 | Pending |
| NEWS-01 | Phase 6 | Pending |
| NEWS-02 | Phase 6 | Pending |
| NEWS-03 | Phase 6 | Pending |
| NEWS-04 | Phase 6 | Pending |
| CHAT-01 | Phase 7 | Pending |
| CHAT-02 | Phase 7 | Pending |
| CHAT-03 | Phase 7 | Pending |
| CHAT-04 | Phase 7 | Pending |
| CHAT-05 | Phase 7 | Pending |
| STOCK-07 | Phase 7 | Pending |
| SEO-01 | Phase 8 | Pending |
| SEO-02 | Phase 8 | Pending |
| SEO-03 | Phase 8 | Pending |
| SEO-04 | Phase 8 | Pending |
| LAND-01 | Phase 9 | Pending |
| LAND-02 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 55 total (enumerated REQ-IDs; supersedes the stale "45" headline)
- Mapped to phases: 55
- Unmapped: 0

**Per-phase counts:**
- Phase 1: 11 (FOUND ×5, AUTH ×5, COMP-01)
- Phase 2: 5 (DATA ×5)
- Phase 3: 5 (SCORE ×5)
- Phase 4: 15 (STOCK-01..06, STOCK-08, FUND ×5, COMP-02..04)
- Phase 5: 3 (SRCH-01, WATCH ×2)
- Phase 6: 4 (NEWS ×4)
- Phase 7: 6 (CHAT ×5, STOCK-07)
- Phase 8: 4 (SEO ×4)
- Phase 9: 2 (LAND ×2)

---
*Requirements defined: 2026-05-27*
*Last updated: 2026-05-27 after roadmap traceability mapping*
