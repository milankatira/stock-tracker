# Stack Research

**Domain:** AI-powered investment-research web app (Indian stocks + mutual funds) — "FinSight AI"
**Researched:** 2026-05-27
**Confidence:** HIGH (core frameworks, versions verified against npm registry + official docs) / MEDIUM (Indian-market community wrappers)

> **Scope note:** The stack is LOCKED by user directive (Next.js 15 + shadcn/ui + Tailwind, NestJS, MongoDB/Mongoose, BullMQ+Redis, Gemini, NestJS-owned JWT+Google OAuth). This document is prescriptive *within* that lock — specific libraries, current versions, and integration patterns. It does NOT re-litigate the stack.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Next.js (App Router, TS)** | `15.5.18` (latest 15.x) | Frontend, SSR/RSC, SEO pages | Locked. Pin to 15.5.x. Next.js 16 is GA (`16.2.x`) but stay on 15 per lock — 15.5 is stable, well-documented, and shadcn/React 19 compatible. Use **React Server Components** for per-stock/per-fund pages so HTML is fully server-rendered and indexable. |
| **React** | `19.2.x` | UI runtime | Ships with Next 15; required by current shadcn/ui. |
| **Tailwind CSS** | `4.3.0` | Styling | Locked. v4 is CSS-first (`@theme` directive, `@import "tailwindcss"`, no `tailwind.config.js` needed). 10x faster builds, zero-config content detection. shadcn CLI initializes v4 by default now. |
| **shadcn/ui** | CLI latest (canary supports Tailwind v4 + React 19) | Component layer | Locked. Not a dependency — it copies component source into your repo. `npx shadcn@latest init` then `add <component>`. Fully Tailwind-v4 compatible. |
| **NestJS** | `11.1.x` (`@nestjs/core` 11.1.24) | Backend API | Locked. v11 is current major. Use modular architecture (one Nest module per domain: `stocks`, `funds`, `scoring`, `auth`, `news`, `chat`). |
| **MongoDB + Mongoose** | `mongoose` `9.6.x`, `@nestjs/mongoose` `11.0.x` | Primary DB + ODM | Locked. `@nestjs/mongoose` 11 aligns with Nest 11. Use `@Schema()` decorator classes + `SchemaFactory.createForClass()`. |
| **BullMQ + Redis** | `bullmq` `5.77.x`, `@nestjs/bullmq` `11.0.x` | Job queue (nightly recompute, news polling) | Locked. **Use `@nestjs/bullmq`, NOT `@nestjs/bull`** — Bull (v3) is legacy/maintenance-only; BullMQ is the actively developed successor with better TS types, flow producers, and repeatable jobs (cron) for nightly recompute. |
| **Redis** | 7.x server (managed: AWS ElastiCache / Upstash) | Cache, sessions, rate-limit, BullMQ backend | Locked. Single Redis serves hot-path cache + queue. Use distinct key prefixes/DBs. Per global rule: **every cache key MUST have a TTL** (24h/7d for Gemini context per PROJECT.md). |
| **Google Gemini via `@google/genai`** | `2.6.0` | All AI narrative/sentiment/chat | Locked vendor. **Use `@google/genai` (the new unified Google Gen AI SDK), NOT `@google/generative-ai`** — the latter is officially deprecated (frozen at `0.24.1`). The new SDK has first-class function calling, **context caching** (the 90% discount path in PROJECT.md), and structured JSON output. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **TradingView Lightweight Charts** | `lightweight-charts` `5.2.0` | Interactive price charts (1D…MAX) | v5 is a major API rewrite from v4 — use v5 docs only. Apache-2.0, ~45KB, canvas-based. |
| **lightweight-charts-react-components** | `2.1.0` | React/Next wrapper for the above | Actively maintained and v5-compatible (verify publisher before adopting — npm name differs from its GitHub repo, so confirm it is the one you intend). Prefer it over abandoned wrappers (Kaktana — deprecated; older `react-lightweight-charts`). **If you want zero wrapper risk, integrate the raw lib directly in a `useEffect` inside a `'use client'` component — fully supported and documented officially by TradingView; this is the safe default.** |
| **@nestjs/jwt** | `11.0.x` | JWT signing/verification | Locked auth approach. Backend owns identity. |
| **@nestjs/passport + passport-jwt** | `@nestjs/passport` `11.0.x`, `passport-jwt` `4.0.1` | JWT strategy guard | Standard Nest auth pattern. `JwtStrategy` validates access token from `Authorization: Bearer`. |
| **passport-google-oauth20** | `2.0.0` | Google OAuth login | Locked. `GoogleStrategy` → on callback, find-or-create user, issue your own NestJS JWT. Google is only the identity provider; your backend mints the session token. |
| **class-validator + class-transformer** | `class-validator` `0.15.x` | DTO validation | MANDATORY per platform rule: all `@Body()` params use typed class-validator DTO classes; `ValidationPipe({ whitelist: true })` strips unknown fields. |
| **yahoo-finance2** | `3.14.1` | Prices, historical, fundamentals | Primary market-data source. Actively maintained (3.x). Suffix Indian tickers `.NS` (NSE) / `.BO` (BSE); index `^NSEI`. Modules: `chart`, `historical`, `quote`, `quoteSummary`, `fundamentalsTimeSeries`. **Wrap in a fallback+cache adapter** — unofficial, no SLA. |
| **stock-nse-india** | `1.4.0` | NSE supplement (quotes, indices, gainers/losers) | Community wrapper over NSE's unofficial endpoints. **Supplement only**, not primary — NSE rate-limits/blocks aggressively; always cache and fall back to Yahoo. MEDIUM confidence. |
| **MFAPI.in (REST, no SDK)** | n/a (HTTP) | Mutual fund NAV + scheme list/history | Free, no auth. `GET /mf` (all schemes), `/mf/search?q=`, `/mf/{schemeCode}` (history), `/mf/{schemeCode}/latest`. Call via `fetch`/`axios` from a Nest provider; cache aggressively. |
| **AMFI NAVAll.txt** | n/a (HTTP + parser) | Authoritative daily NAV fallback | `https://www.amfiindia.com/spages/NAVAll.txt`, updated ~9 PM IST. Parse line-by-line (`;`-delimited) into your funds collection nightly via a BullMQ repeatable job. Use as the source-of-truth fallback when MFAPI is down. |
| **rss-parser** | `3.13.x` | MoneyControl / ET RSS news ingestion | Parse MoneyControl & Economic Times RSS feeds in a Nest provider; dedupe by URL/guid; feed headlines into Gemini sentiment classification. |
| **NewsData.io / GNews (REST)** | n/a (HTTP) | Supplemental news API (free tier) | Free tiers are low-volume — use RSS as the primary cheap firehose, News APIs as enrichment. Store API keys in secret manager (platform rule: no hardcoded secrets). |
| **gemini-embedding-001** (via `@google/genai`) | model | News/filing embeddings for Atlas Vector Search | **Use `gemini-embedding-001` at 768 output dimensions** (MRL-truncated). `text-embedding-004` is DEPRECATED (sunset Jan 14 2026) — do not use it. 768 dims keeps the Atlas vector index small and is the recommended quality/size balance (model also supports 1536/3072). Set `taskType: RETRIEVAL_DOCUMENT` for stored docs, `RETRIEVAL_QUERY` for searches. |
| **MongoDB Atlas Vector Search** | Atlas (managed) | Semantic news/filing search | Define a `vectorSearch` index on the embedding field (768 dims, `cosine`). Query with the `$vectorSearch` aggregation stage. Requires Atlas (not self-hosted Community) — confirm Atlas M10+ tier. |
| **MongoDB time-series collections** | MongoDB 6.0+ / Atlas | Price/NAV history storage | Create with `timeField`, `metaField: { symbol, source }`, `granularity: 'minutes'`. Native compression for OHLC history; query with normal aggregation. NOT TimescaleDB. |
| **Razorpay Node SDK** | `razorpay` `2.9.6` | Subscriptions billing | **DEFERRED to monetisation milestone** — brief only. Subscriptions API (`razorpay.subscriptions.create`) + webhook signature verification. Do not build in v1; AMFI ARN/payments are out of scope per PROJECT.md. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Turborepo + pnpm workspaces** | Monorepo for `apps/web` (Next) + `apps/api` (Nest) + `packages/shared` (types/DTOs/Zod) | **Recommended: single monorepo.** Both apps are TypeScript — share DTOs, score-card types, and ticker enums via `packages/shared`, avoiding drift between API contract and frontend. Turborepo caches builds/tests across both. pnpm for fast, disk-efficient installs. |
| **TypeScript** | `5.x` (strict) | `strict: true`. Per platform rule: no bare `any` — use `unknown` + validate. Shared `tsconfig` base in monorepo root. |
| **ESLint + Prettier** | Lint/format | Next.js + NestJS flat-config presets. |
| **Jest / Vitest** | Tests | NestJS ships Jest; Next/React side can use Vitest + React Testing Library. Platform rule: test file per source file, 80% coverage. |
| **Docker Compose** | Local Redis + MongoDB | Spin up Redis + Mongo (with replica set for time-series/transactions) locally. Atlas for vector search in staging/prod. |

## Installation

```bash
# Monorepo scaffold
pnpm dlx create-turbo@latest finsight
# apps/web — Next.js 15 + Tailwind v4 + shadcn
cd apps/web
pnpm create next-app@15 . --ts --app --tailwind --eslint --src-dir --import-alias "@/*"
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card chart input dialog tabs badge

# Frontend libs
pnpm add lightweight-charts@5 lightweight-charts-react-components

# apps/api — NestJS 11
cd ../api
pnpm add @nestjs/core @nestjs/common @nestjs/platform-express
pnpm add @nestjs/mongoose mongoose
pnpm add @nestjs/bullmq bullmq ioredis
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt passport-google-oauth20
pnpm add class-validator class-transformer
pnpm add @google/genai
pnpm add yahoo-finance2 stock-nse-india rss-parser axios
pnpm add razorpay   # deferred milestone — install when monetisation starts

# Dev
pnpm add -D typescript @types/node @types/passport-jwt @types/passport-google-oauth20 jest
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `lightweight-charts-react-components` | Direct raw integration in `'use client'` + `useEffect` | If you want zero third-party wrapper dependency / maximum control over the chart lifecycle. Both are valid; wrapper is faster to ship. |
| `@google/genai` (Gemini Node SDK directly) | Vercel AI SDK (`ai` + `@ai-sdk/google`) | If you later want streaming UI primitives + provider-swappable abstraction in the Next frontend. For backend deterministic+function-calling flows, the native `@google/genai` SDK gives the most direct access to context caching. |
| MFAPI.in as primary NAV | Direct AMFI NAVAll.txt parse as primary | If MFAPI reliability becomes a problem, flip AMFI nightly parse to primary and MFAPI to supplement. |
| Turborepo monorepo | Two separate repos | Only if web and API are owned by fully separate teams with independent release cadences — not the case here (solo/small, shared types matter more). |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@google/generative-ai` | Officially **deprecated**; frozen at 0.24.1; missing newer features | `@google/genai` (`2.6.0`) |
| `text-embedding-004` / `embedding-001` | Deprecated; `text-embedding-004` sunset **Jan 14 2026** | `gemini-embedding-001` @ 768 dims |
| `@nestjs/bull` + `bull` | Legacy v3; maintenance-only | `@nestjs/bullmq` + `bullmq` |
| `lightweight-charts` v4 API patterns | v5 is a breaking rewrite; v4 tutorials won't compile | v5 (`5.2.0`) API |
| Kaktana / stale React chart wrappers | Deprecated, unmaintained | `lightweight-charts-react-components` or raw integration |
| `tailwind.config.js`-centric v3 setup | Tailwind v4 is CSS-first (`@theme`), not JS-config-first | v4 `@import "tailwindcss"` + `@theme` in `globals.css` |
| Next.js 16 | Outside the locked v15 line | Next.js `15.5.x` |
| Letting Gemini emit numbers | Violates AI invariant + SEBI compliance (PROJECT.md) | Deterministic scoring engine computes all numbers; Gemini gets them as function-call inputs / context and only writes prose |
| Storing `locationId`/identity from client | Platform security rule | Derive user identity server-side from the NestJS-minted JWT |

## Stack Patterns by Variant

**SEO per-stock/per-fund pages (`/stock/[symbol]`, `/fund/[code]`):**
- Use React Server Components + `generateStaticParams` (for top tickers) or on-demand SSR with `revalidate` (ISR) for the long tail.
- Add `generateMetadata` per page + JSON-LD structured data (`FinancialProduct` / `Article`) for rich results.
- Server-fetch from the Nest API and render full HTML — never client-only fetch for the indexable content, or crawlers see empty shells.

**Ask FinSight chat (function calling):**
- Define Gemini function declarations that map to Nest service methods (`getScore`, `getFundamentals`, `getNews`). Gemini decides which to call; your code executes and returns real data; Gemini narrates. This enforces the "AI never invents figures" invariant.
- Use Gemini **context caching** (`@google/genai` caches) for the per-stock context blob with the 24h/7d TTL from PROJECT.md → 90% token discount on repeat queries.

**Nightly recompute + news polling:**
- BullMQ **repeatable jobs** (cron) registered in a Nest module: one queue for `score-recompute` (nightly, after AMFI 9 PM IST update), one for `news-poll` (every N minutes). Workers as `@Processor` classes.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@15.5` | `react@19.2` | React 19 is the expected pair for Next 15.5; shadcn current components target React 19. |
| `tailwindcss@4` | `shadcn` (current CLI) | shadcn CLI initializes v4 projects; ensure `@/*` alias in `tsconfig`. |
| `@nestjs/core@11` | `@nestjs/mongoose@11`, `@nestjs/bullmq@11`, `@nestjs/jwt@11`, `@nestjs/passport@11` | Keep all `@nestjs/*` on the 11.x line to avoid peer-dep mismatches. |
| `mongoose@9.6` | `@nestjs/mongoose@11` | Verify the Nest adapter's mongoose peer range on install; pin both. |
| `bullmq@5` | `ioredis` | BullMQ uses ioredis under the hood; share one Redis connection config. |
| `lightweight-charts@5` | `lightweight-charts-react-components@2` | Wrapper v2 targets lib v5. Do not mix with v4. |
| `gemini-embedding-001@768` | Atlas vector index `numDimensions: 768` | Index dimension must exactly match the embedding output dimension. |

## Sources

- npm registry (live version query, 2026-05-27) — verified: `@google/genai` 2.6.0, `next` 15.5.18 (16.2.6 latest overall), `react` 19.2.x, `tailwindcss` 4.3.0, `@nestjs/core` 11.1.24, `mongoose` 9.6.2, `@nestjs/mongoose` 11.0.4, `bullmq` 5.77.6, `@nestjs/bullmq` 11.0.4, `lightweight-charts` 5.2.0, `lightweight-charts-react-components` 2.1.0, `yahoo-finance2` 3.14.1, `stock-nse-india` 1.4.0, `rss-parser` 3.13.0, `razorpay` 2.9.6, `passport-jwt` 4.0.1, `passport-google-oauth20` 2.0.0, `class-validator` 0.15.x — HIGH
- ai.google.dev/gemini-api/docs/migrate — `@google/generative-ai` deprecated → `@google/genai` unified SDK — HIGH
- ai.google.dev/gemini-api/docs/embeddings + Google Developers Blog — `gemini-embedding-001` GA, 3072 default with MRL truncation to 1536/768; `text-embedding-004` sunset Jan 14 2026 — HIGH
- ui.shadcn.com/docs/tailwind-v4 + /docs/installation/next — shadcn CLI Tailwind v4 + React 19 support — HIGH
- tradingview.github.io/lightweight-charts (v5 docs) — v5 current/official; `lightweight-charts-react-components` 2.1.0 confirmed on npm (publisher provenance to be verified at adoption; raw integration is the zero-risk fallback) — HIGH (lib) / MEDIUM (wrapper)
- mongodb.com/docs/atlas/atlas-vector-search ($vectorSearch stage, ≤4096 dims, cosine) — HIGH
- mfapi.in/docs + amfiindia.com NAVAll.txt — MF NAV endpoints/patterns — MEDIUM
- npmjs `yahoo-finance2` / `stock-nse-india` — community-maintained, no SLA — MEDIUM (Indian-market wrappers turnover; treat as fallback-cached adapters)

---
*Stack research for: AI investment-research web app (Indian market), locked TS stack*
*Researched: 2026-05-27*
