# Project Research Summary

**Project:** FinSight AI
**Domain:** AI-powered investment-research web app (Indian stocks + mutual funds)
**Researched:** 2026-05-27
**Confidence:** HIGH (with two flagged research gaps — see Research Flags)

## Executive Summary

FinSight AI is a "Zomato-for-investing" web app that collapses multi-axis data platforms into one deterministic 1–10 score, a plain-English worded verdict, six insight cards, news sentiment, and a conversational research chatbot — all under 2 seconds, for Indian retail investors covering both stocks and mutual funds. No 2026 incumbent unifies this combination across both asset classes with grounded, compliance-safe AI. The whitespace is real; the core risks are legal and correctness, not performance.

The recommended build approach is a Turborepo monorepo (Next.js 15 + NestJS) backed by MongoDB Atlas (Mumbai, ap-south-1), Redis, BullMQ, and Gemini via the `@google/genai` SDK. Two non-negotiable invariants drive nearly every architecture decision: (1) Gemini never generates a number — all scores and metrics are deterministically computed and only prose narration touches the LLM; and (2) every AI surface passes through a single NestJS compliance interceptor that enforces "analysis not advice" framing before any output reaches the client. These invariants must be enforced by construction from phase one, not retrofitted later.

The highest risks are (a) compliance: SEBI's Dec 2024 amendments bring AI-scoring platforms under Research Analyst oversight — BUY/SELL language pre-registration is an existential exposure; (b) data fragility: Yahoo Finance, MFAPI, NSE/BSE unofficial wrappers are uncontracted free sources that will break under production volume; and (c) scoring correctness: the pillar sub-formulas inside the high-level weights (35/20/20/10/10/5) are underspecified in the PRD and must be researched before the scoring engine is built. Both (a) and (c) require dedicated phase-specific research before implementation.

---

## Non-Negotiable Invariants

These are cross-cutting decisions that every phase and every engineer must honor. They are not options.

1. **Use `@google/genai` SDK version `2.6.0`.** The old `@google/generative-ai` is officially deprecated (frozen at `0.24.1`). Never reference it in code, docs, or prompts.

2. **Embeddings: `gemini-embedding-001` at 768 output dimensions.** `text-embedding-004` was sunset January 14 2026. The Atlas vector index `numDimensions` must exactly match `768`.

3. **AI narratives are precomputed in the nightly BullMQ job.** The `<2s` report read path is `Redis → Mongo` only — never a live Gemini call. Live Gemini is reserved exclusively for Ask FinSight chat (SSE-streamed). Any `gemini.generate()` call inside a GET handler is an architecture violation.

4. **Numbers are deterministic; template-slot insertion + post-generation numeric audit stop number drift.** Gemini writes sentence structure with placeholders; server code substitutes verified values. A post-generation audit extracts every numeric token from narrative and asserts it appears verbatim in the verified data set. Reject or regenerate on mismatch.

5. **Verdict is a typed enum at the data layer from day one:** `STRONG_SCORE | CAUTION | WEAK_SCORE`. The words "buy," "sell," "hold," "recommend," "target price," and "you should invest" must never appear in code, prompt templates, SEO copy, or generated output. The compiler enforces the enum; the compliance interceptor enforces the prose.

6. **ComplianceModule is a NestJS interceptor — a single enforced chokepoint, not a service to call.** The raw Gemini client is private behind the AIModule facade. No code path can call Gemini without compliance applied. This interceptor ships with the first Gemini surface (Phase 4), not as a later hardening task.

7. **MongoDB Atlas is required.** Atlas Vector Search (news/semantic search) and Atlas Search (autocomplete) are not available on Community or self-hosted MongoDB. PROJECT.md's "self-hosted ap-south-1" note must be reconciled: deploy MongoDB Atlas in the Mumbai (ap-south-1) region, which satisfies both the feature requirement and DPDP data-residency intent.

8. **Cache + BullMQ jobs are a hard prerequisite for SEO pages.** The materialised-read architecture (precomputed scores + narratives persisted to Mongo, hot in Redis) must exist before any public report page is built. Phase ordering is non-negotiable on this dependency.

---

## Key Findings

### Recommended Stack

The stack is locked by user directive (Next.js 15 + NestJS + MongoDB + Gemini). This research is prescriptive within that lock. The monorepo pattern (Turborepo + pnpm workspaces) with `apps/web`, `apps/api`, and `packages/shared` is strongly recommended — shared TypeScript DTOs and score types prevent API-contract drift between frontend and backend. All `@nestjs/*` packages must stay on the `11.x` line; mixing major versions causes peer-dep failures.

**Core technologies:**
- **Next.js `15.5.x` + React `19.2.x`** — frontend, SSR/RSC for SEO pages, App Router. Pin to 15.5, not 16.
- **Tailwind CSS `4.3.0`** — CSS-first (`@theme` directive, no `tailwind.config.js`). shadcn CLI initializes v4 by default.
- **shadcn/ui (current CLI)** — component source is copied into the repo, not a runtime dep.
- **NestJS `11.1.x`** — modular monolith backend. One module per domain: `auth`, `stocks`, `funds`, `scoring`, `news`, `sentiment`, `ai`, `compliance`, `search`, `watchlist`, `jobs`, `cache`.
- **MongoDB Atlas + Mongoose `9.6.x` / `@nestjs/mongoose 11.0.x`** — primary store, time-series collections for price/NAV history, Atlas Vector Search for news embeddings, Atlas Search for autocomplete.
- **BullMQ `5.77.x` / `@nestjs/bullmq 11.0.x`** — job queue for nightly EOD recompute, news polling, narrative batch. Use `@nestjs/bullmq`, NOT `@nestjs/bull` (legacy).
- **Redis 7.x** — hot-path cache, BullMQ backend, sessions, rate limits. Every cache key must have a TTL.
- **`@google/genai 2.6.0`** — all Gemini surfaces (narrative, SWOT, sentiment, chat). Implicit context caching (1,024-token minimum on Flash) for the cost target.
- **TradingView Lightweight Charts `5.2.0`** — price charts. v5 is a breaking rewrite from v4; use v5 docs only.
- **`yahoo-finance2 3.14.1`** — primary price/fundamentals source. Unofficial, no SLA. Suffix: `.NS` (NSE), `.BO` (BSE).
- **MFAPI.in (HTTP) + AMFI NAVAll.txt** — mutual fund NAV. AMFI is the authoritative fallback, parsed nightly via BullMQ.
- **`class-validator` / `class-transformer`** — mandatory DTO validation on all `@Body()` params. `ValidationPipe({ whitelist: true })` strips unknown fields.

**What NOT to use:** `@google/generative-ai`, `text-embedding-004`, `@nestjs/bull` + `bull`, Lightweight Charts v4 API patterns, `tailwind.config.js` v3 setup, Next.js 16.

### Expected Features

The full PRD MVP is in scope by user directive. Priority within P1 follows the dependency graph, not raw value.

**Must have (table stakes):** Search + autocomplete; interactive price chart with adjusted history; fundamentals strip; technicals strip; MF metrics (returns vs benchmark, Sharpe, Sortino, alpha, beta, max drawdown, expense ratio, AUM); peer comparison (2–3 way); watchlist with daily refresh; news feed per instrument; auth (email/password + Google OAuth, DPDP consent); landing page; disclaimers on every screen.

**Should have (differentiators):** Single 1–10 FinSight Score + worded verdict for stocks and funds; cross-asset parity (no incumbent does this); six Insight Cards as report hero; one-paragraph precomputed Gemini summary; MF "Better Alternatives"; news sentiment tags; AI comparison verdict ("higher FinSight Score," never "buy"); public indexable SEO pages (SSR + JSON-LD); Ask FinSight chat (function-calling, SSE-streamed).

**Defer to v1.x / v2+:** Smart alerts, broker portfolio sync, AI screener, multi-language, rebalance AI, SEBI RA registration, AMFI ARN/billing, IPO verdicts, F&O, goal planner, tax reports.

### Architecture Approach

Modular NestJS monolith (not microservices at v1 scale) with a strict materialised-read architecture: all heavy computation (scoring, Gemini narrative, news sentiment) runs in background BullMQ jobs and is persisted to Mongo and warmed into Redis. Public report pages are pure read operations (`Redis → Mongo`) with zero synchronous LLM calls.

**Major components:**
1. **DataIngestionModule** — provider adapter + fallback chain + circuit breaker + schema validation + data-lineage tagging. No domain code touches a provider SDK directly.
2. **ScoringModule** — pure functions, zero I/O. Input = `ScoreInput`, output = `Score` with full pillar breakdown. Orchestration lives in `StocksModule`/`FundsModule`. Core IP; 100% TDD.
3. **JobsModule (BullMQ)** — EOD recompute (fan-out, idempotent per-ticker batches), news-poll (30 min), narrative-batch, watchlist-refresh.
4. **AIModule** — Gemini facade. Private `gemini.client.ts` never exported. Wraps implicit context caching (keyed by `ticker:dataVersionHash`), structured JSON output, read-only function-call tool registry.
5. **ComplianceModule** — NestJS interceptor wrapping every AIModule response. Strips forbidden verbs, injects disclaimer metadata, attaches `pastPerformance` caveat. For streaming chat, sanitises assembled buffer before SSE chunks reach the client.
6. **SearchModule** — autocomplete over unified instrument master via Atlas Search.
7. **CacheModule** — Redis facade with centralised TTL policy table.

**Key patterns:** Provider Adapter + Fallback Chain; Pure function core + imperative shell; Materialised read path (Redis → Mongo only); Versioned cache invalidation (`ticker:dataVersionHash`).

### Critical Pitfalls

1. **Compliance framing bolted on last** — verdict is a typed enum at the data layer from day one; ComplianceInterceptor built with the first Gemini surface.
2. **AI narrative leaking wrong numbers** — template-slot insertion + post-generation numeric audit; reject on mismatch.
3. **Free data sources breaking silently** — multi-source fallback chain + schema validation at ingestion + aggressive Redis caching (stale-but-labeled, not blank).
4. **Synchronous Gemini on the report request path** — precompute narrative in nightly job; report read path is Redis → Mongo only; live Gemini only for Ask FinSight SSE stream.
5. **Indian-market data quirks corrupting scores** — canonical instrument master + always-adjusted price series + explicit scheme-code/plan/option keying.
6. **MongoDB Atlas vs self-hosted conflict** — deploy MongoDB Atlas in Mumbai (ap-south-1). Do not attempt Community MongoDB for vector/search features.
7. **Explicit Gemini context caching per stock won't trigger** (32,768-token min) — use implicit caching (1,024-token min on Flash).

---

## Implications for Roadmap

Suggested phases: 9. Build order follows the dependency graph, not raw value.

### Phase 1: Scaffold + Infrastructure + Compliance Contract
**Delivers:** Running Turborepo monorepo; NestJS/Next.js connected; Atlas + Redis connected; auth end-to-end; CacheModule with TTL policy; ComplianceModule interceptor shape + verdict enum in place; DPDP consent record.
**Research flag:** Standard patterns.

### Phase 2: Data Ingestion + Cache + Instrument Master
**Delivers:** Provider adapters (Yahoo, MFAPI, AMFI, NSE/BSE); fallback chain + circuit breaker; schema validation on every external payload; data-lineage tagging; canonical instrument master; adjusted price series; market-holiday calendar; nightly NAV parse job; Redis cache wired.
**Research flag:** Minor — brief empirical rate-limit testing per provider.

### Phase 3: Pure Scoring Engine (TDD) + Score History + EOD BullMQ Job
**Delivers:** `scoreStock()` and `scoreFund()` pure functions with full pillar breakdowns; snapshot determinism tests; ScoreHistory time-series collection; BullMQ `eod-recompute` (fan-out, idempotent); `watchlist-refresh`.
**Research flag: NEEDS PHASE RESEARCH** — pillar sub-formulas (metric selection, normalisation, peer selection, NAV timing) underspecified in PRD. Core IP — resolve before TDD.

### Phase 4: Stock Report + MF Report + AI Narrative + Compliance Interceptor (active)
**Delivers:** Report controllers; six insight cards; one-paragraph precomputed Gemini summary (template-slot + numeric audit); MF returns/risk/holdings/Better Alternatives; ComplianceInterceptor active on all AI surfaces; `narrative-batch` job; report Redis cache with versioned invalidation.
**Research flag:** Standard patterns.

### Phase 5: Search + Watchlist
**Delivers:** Atlas Search index; unified autocomplete endpoint; watchlist CRUD; daily score refresh from EOD job.
**Research flag:** Standard patterns.

### Phase 6: News Feed + Sentiment Tags
**Delivers:** NewsModule (RSS + NewsData.io, dedup, embeddings @ 768 dims, Atlas Vector Search index); SentimentModule (Positive/Negative/Neutral via AIModule + ComplianceInterceptor); per-headline tags; Sentiment pillar input wired to scoring.
**Research flag:** Standard patterns.

### Phase 7: Ask FinSight Chat
**Delivers:** SSE chat endpoint; Gemini function-calling with read-only tool registry; streaming ComplianceInterceptor; citation enforcement; out-of-scope refusal; chat history; Next.js chat component; stock comparison AI verdict.
**Research flag: NEEDS PHASE RESEARCH** — chat guardrails MEDIUM confidence (prompt-injection defence, out-of-scope refusal, citation-grounding, SEBI-safe templating, SSE sanitisation).

### Phase 8: Public SEO Pages
**Delivers:** `/stock/[ticker]` and `/fund/[schemeCode]` RSC pages; `generateStaticParams` for top-N (ISR long tail); JSON-LD; OG/Twitter cards; canonical URLs; full HTML in view-source; disclaimers on public AI content.
**Research flag:** Standard patterns.

### Phase 9: Marketing Landing Page
**Delivers:** Static marketing landing page (value prop, pricing teaser, CTA); responsive layout.
**Research flag:** Standard patterns.

### Phase Ordering Rationale
- Invariant enforcement by construction: ComplianceModule shape in Phase 1; ScoringModule pure before any report screen.
- Materialised read is a hard prerequisite: EOD job (Phase 3) + Redis cache (Phase 1) before SEO pages (Phase 8).
- Ask FinSight last among features — deepest dependency chain, highest uncertainty.
- Sentiment (Phase 6) feeds scoring (Phase 3): design scoring with a graceful zero/neutral fallback for the Sentiment pillar so recompute runs before news exists.

---

## Research Flags Summary

**Needs `/gsd-research-phase` before planning:** Phase 3 (scoring sub-formulas), Phase 7 (Ask FinSight guardrails).
**Standard patterns (skip phase research):** Phases 1, 2, 4, 5, 6, 8, 9.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm registry verified live (2026-05-27); core package versions confirmed. |
| Features | HIGH / MEDIUM (Ask FinSight guardrails) | Competitor analysis from official Tickertape, Trendlyne, Screener docs. |
| Architecture | HIGH | Structure determined by locked stack + two invariants; Gemini caching + Atlas verified against official docs. |
| Pitfalls | HIGH (compliance + AI) / MEDIUM (scoring, free-data) | Verified against SEBI Dec 2024 amendments + DPDP Rules 2025. |

**Overall confidence:** HIGH with two known research gaps.

### Gaps to Address
- **Scoring pillar sub-formulas** — close in Phase 3 planning via `/gsd-research-phase` before scoring code is written.
- **Ask FinSight guardrails** — Phase 7 planning needs dedicated research.
- **MongoDB Atlas vs self-hosted** — deploy Atlas in ap-south-1 (Mumbai); do not carry forward the self-hosted assumption.
- **Explicit vs implicit Gemini caching** — per-stock uses implicit caching (1,024-token min on Flash); explicit only when batching many symbols.
- **Free-tier rate-limit strategy per provider** — Phase 2 brief empirical testing + jitter/backoff per provider.

---

## Sources

### Primary (HIGH confidence)
- npm registry (live query, 2026-05-27) — version verification for all core packages
- ai.google.dev/gemini-api/docs — `@google/genai` SDK, context caching, `gemini-embedding-001`, structured output, function calling
- mongodb.com/docs/atlas — Atlas Vector Search, time-series limitations, Atlas Search (Atlas-only)
- ui.shadcn.com/docs — Tailwind v4 + React 19 + shadcn CLI compatibility
- tradingview.github.io/lightweight-charts (v5 docs)
- SEBI RA/IA framework Dec 2024 amendments — AI-scoring platforms under RA oversight
- DPDP Rules 2025 (PIB Gazette, Nov 13 2025) — phased obligations, Phase 3 active May 13 2027
- tickertape.in / trendlyne.com/score-details / screener.in/features — competitor scoring methodology
- `.planning/PROJECT.md` — authoritative project constraints, invariants, MVP scope

### Secondary (MEDIUM confidence)
- mfapi.in/docs + amfiindia.com NAVAll.txt — MF NAV endpoint patterns
- `yahoo-finance2` / `stock-nse-india` on npmjs — community-maintained, no SLA
- Gemini API pricing — Flash vs Pro cost comparison

---
*Research completed: 2026-05-27*
*Ready for roadmap: yes*
