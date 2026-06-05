# FinSight AI

## What This Is

FinSight AI is an AI-powered investment intelligence **web app** for Indian retail investors. A user types in any Indian stock or mutual fund and gets a single deterministic 1–10 score, a plain-English verdict, six insight cards, news sentiment, and a Gemini-powered conversational "Ask FinSight" chat. It targets under-30 first-time investors (Rahul) and mid-career SIP investors (Priya) who are overwhelmed by raw-data platforms and want an opinionated, contextual answer to "is this worth my money right now?"

The product is a "Zomato-for-investing": opinion-first, not data-dump-first. Flow runs from a public SEO landing page → auth → search → report → watchlist, with public indexable per-stock/per-fund analysis pages as the SEO distribution moat.

## Core Value

Plain-English score, verdict, and reasoning for any Indian stock or mutual fund — rendered in under 2 seconds.

## Requirements

### Validated

- [x] Public, indexable SEO pages — one URL per stock and per fund (server-rendered, structured data) — Validated in Phase 08: public-seo-pages (RSC pages + JSON-LD + sitemap/robots/OG + revalidate webhook; full-universe sitemap pending Phase-2 public instruments endpoint)

### Active

<!-- v1 MVP. Pulled from PRD §8.1 "MVP" rows + landing/SEO surfaces. User selected Full PRD MVP. -->

- [ ] Public marketing landing page (value prop, pricing teaser, CTA to sign up)
- [ ] Auth — sign up / log in via email-password and Google OAuth (NestJS-owned JWT sessions)
- [ ] Stock Report — deterministic FinSight Score (1–10), worded verdict (compliance-safe), one-paragraph Gemini summary
- [ ] Six Insight Cards per stock — Score, Volatility, Profit Consistency, Event Sensitivity, SWOT, Promoter Holdings
- [ ] Interactive price chart (1D/1W/1M/6M/1Y/5Y/MAX) + fundamentals strip + technicals strip
- [ ] Mutual Fund Report — parallel FinSight Fund Score (1–10), verdict, returns vs benchmark, risk profile, holdings, "better alternatives"
- [ ] Search + autocomplete across stocks and funds
- [ ] Watchlist (add/remove, daily score refresh)
- [ ] Ask FinSight — Gemini-powered conversational chat scoped to a stock/fund/portfolio, with function-calling into the data layer
- [ ] News feed per stock with AI sentiment tags (Positive/Negative/Neutral)
- [ ] Stock comparison (2–3 way) with AI verdict on the better pick
- [ ] Scoring engine — deterministic compute of stock & MF scores from real data, with nightly recompute job
- [ ] Compliance layer — "analysis not advice" framing, disclaimers, AI output sanitisation filter

### Out of Scope

<!-- Explicit boundaries for v1, with reasoning to prevent re-adding. -->

- Native mobile apps (iOS/Android, React Native) — web-first for speed + SEO; native is a future milestone
- Real-time tick / sub-minute price data — needs paid/licensed feeds; free 15-min-delayed data for v1
- Portfolio broker sync (Zerodha/Groww/Upstox OAuth) — PRD V1 phase, deferred to a later milestone (adds OAuth + broker-specific integrations)
- Portfolio score + rebalance AI — depends on broker sync; future milestone
- Smart push alerts — depends on a notification channel; future milestone
- Risk profile questionnaire + AI portfolio builder — PRD V1, deferred
- IPO verdicts — PRD V2
- AI prompt-based screener — PRD V2
- Multi-language (Hindi/Marathi/Gujarati/Tamil) — PRD V2
- F&O module, goal-based planner, tax/capital-gains reports — PRD V3
- Branded BUY/SELL recommendations — legally gated behind SEBI RA registration
- AMFI ARN / direct MF distribution + payments — requires ARN; Razorpay subscription billing deferred to monetisation milestone
- Native order placement / "open in broker" deep links — execution is out of scope; research only

## Context

- **Source PRD:** `FinSight_AI_PRD.docx` (v1.0, 27 May 2026) — comprehensive 24-section product spec. This project deliberately deviates from PRD §15 on the tech stack (see Constraints).
- **Market:** 21.28 cr demat accounts (Nov 2025), 75% of 2025 new accounts under 30. Incumbents (Tickertape, Smallcase, StockEdge, INDmoney, Screener.in, Trendlyne, Trackk.in) are data-first or super-apps; the white space is an opinion-first, AI-native, broker-agnostic research tool covering both stocks AND mutual funds.
- **Reference product:** Trackk.in — six insight cards, AI scoring, opinionated verdicts. We replicate + extend the six-card framework and add MF coverage + conversational AI.
- **Scoring is the core IP:** weighted across Fundamentals (35%), Valuation (20%), Technical/Momentum (20%), Sentiment/News (10%), Risk/Quality (10%), Event Sensitivity (5%) for stocks; a parallel Returns/Risk-adjusted/Consistency/Costs/Manager/Portfolio framework for funds.
- **Free data ecosystem (v1):** Yahoo Finance (`yahoo-finance2` Node) for prices/historical/fundamentals, MFAPI.in + AMFI for NAV/scheme data, NSE/BSE unofficial wrappers as supplements, MoneyControl/ET RSS + NewsData.io free tier for news.

## Constraints

- **Tech stack (DELIBERATE OVERRIDE of PRD §15)**: Frontend = Next.js 15 (App Router, TypeScript) + shadcn/ui + Tailwind CSS. Backend = NestJS (TypeScript). Database = MongoDB (Mongoose). AI = Google Gemini. **No React Native. No Python.** — User directive; keeps the whole product in one TypeScript ecosystem for build speed.
- **MongoDB substitutions** (PRD assumed a Postgres ecosystem; these are the Mongo-native equivalents so downstream planning does NOT reintroduce Postgres tooling):
  - Time-series price history → **MongoDB time-series collections** (not TimescaleDB)
  - News/filing embeddings + semantic search → **MongoDB Atlas Vector Search** (not pgvector)
  - Job queue (nightly score recompute, news polling) → **BullMQ + Redis** (not Celery — backend is Node)
  - Caching / sessions / rate limits → **Redis**
- **Compliance (NON-NEGOTIABLE)**: All output framed as "analysis," never "advice," until SEBI RA registration. No explicit BUY/SELL verbs in v1 — use "Strong Score / Caution / Weak Score." Prominent disclaimer on every report screen. "Past performance" disclaimer on every returns view. Do not rely on the "educational" loophole.
- **AI invariant (NON-NEGOTIABLE)**: Gemini NEVER generates a number. All scores, prices, and metrics are computed deterministically from real data. Gemini only writes the narrative summary, SWOT bullets, news sentiment classification, and conversational chat — always with cited data sources, never hallucinated figures.
- **Performance**: Stock report must render full content in < 2 seconds on a 4G connection. Aggressive caching (Redis hot path, Gemini context cache with 24h/7d TTLs).
- **Data**: Free-tier sources for v1, 15-minute delayed prices acceptable (no NSE/BSE data licence needed for delayed display). Multi-source fallback + cache to survive rate limits.
- **Data residency / security**: Deploy **MongoDB Atlas in the Mumbai (ap-south-1) region** — Atlas Vector Search + Atlas Search are Atlas-only, not available on self-hosted Community MongoDB. Atlas-Mumbai satisfies both the feature requirement and DPDP residency intent. No raw broker passwords ever stored; secrets in a secret manager. DPDP Act 2023 consent flow (timestamped record) on first sign-up.
- **AI cost**: Gemini Flash / Flash-Lite for high-volume narrative + sentiment; 2.5 Pro reserved for deep reasoning. Context caching for 90% discount on repeated stock/fund context.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web-only Next.js for v1 (no React Native) | Fastest path to a full product; server-rendered pages double as the SEO distribution moat | — Pending |
| NestJS + MongoDB + Gemini stack (override PRD's RN/Python/Postgres) | Single TypeScript ecosystem, fast iteration, user directive | — Pending |
| NestJS-owned JWT auth + Google OAuth (not Clerk) | Self-contained, no vendor lock-in, backend owns identity | — Pending |
| Full PRD MVP scope (7 MVP features + landing + SEO pages) | User wants an end-to-end product, not a thin slice | — Pending |
| Real free data APIs from day one (not mocked) | Real verdicts require real data; free tier keeps cost at zero | — Pending |
| Numbers deterministic, Gemini narrative-only | Accuracy + SEBI compliance — the AI must not invent financial figures | — Pending |
| Defer broker sync / alerts / payments to later milestones | Each adds significant integration surface; not needed to prove core value | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-05 after Phase 08 (public-seo-pages) completion*
