# Phase 4: Reports, AI Narrative & Active Compliance — Research

**Researched:** 2026-05-28
**Domain:** Materialised read-path report rendering (Next.js 15 RSC) + precomputed Gemini narrative pipeline (NestJS + BullMQ) + active NestJS compliance interceptor for AI surfaces
**Confidence:** HIGH (stack + architecture locked and verified against npm registry + official docs); MEDIUM on `lightweight-charts-react-components` wrapper maturity (raw-`useEffect` integration is the zero-risk fallback)

---

## Summary

Phase 4 is where every locked invariant from the architecture becomes user-visible at the same time: deterministic numbers (from Phase 3), a precomputed Gemini narrative that never invents a figure, a single NestJS interceptor that strips advice verbs from every AI surface, and a `<2s`-on-4G report render achieved by reading **only** Redis → Mongo. The phase ships two report screens (stock + MF), six insight cards, a Lightweight Charts v5 timeframe-switching price chart, fundamentals/technicals strips, peer comparison, and the `narrative-batch` BullMQ job that fans out after `eod-recompute` finishes.

The architectural shape is fully prescribed by the project's two non-negotiable invariants (numbers are deterministic; all AI passes the compliance chokepoint). The remaining design surface is concrete: how to layer Suspense streaming in App Router so the score gauge paints first; how to template-slot Gemini's narrative so digits come from verified `ScoreInput` not from token sampling; how to assemble the `ComplianceInterceptor` so it is a global guard on every AIModule response rather than a "remember to call it" helper; and how to wire Redis hot-cache + `revalidateTag` invalidation off the nightly recompute so EOD changes propagate without a manual purge.

**Primary recommendation:** Build the read path as a single denormalised `ReportDoc` per instrument (already-shaped for the page) hot in Redis (TTL until next recompute), invalidated by `dataVersionHash` from the EOD job. The Next.js RSC page does **one** `fetch` to the NestJS report endpoint, streams the score+verdict shell first via Suspense, and chunks in cards/chart/peers as data resolves. Gemini narrative is **structured-JSON** output with named placeholders (`{score}`, `{pe}`, `{return1y}`) — the server fills the digits from the same `ScoreInput` Phase 3 produced; a regex numeric audit rejects + regenerates any narrative whose tokens don't match. The `ComplianceInterceptor` is **global** (`APP_INTERCEPTOR`), wraps the AIModule facade, and is unit-tested with a fixture pack of forbidden-verb narratives that must be blocked.

---

## User Constraints (from CONTEXT.md / phase brief)

> No CONTEXT.md exists for this phase. Constraints below are taken verbatim from the phase brief's `<locked_decisions_no_relitigation>` and `<focus_areas>` blocks plus PROJECT.md and the project-wide ARCHITECTURE/STACK/PITFALLS research.

### Locked Decisions (do not relitigate)
- **Stack:** Next.js 15 App Router + RSC + shadcn/ui + Tailwind v4; NestJS 11 + Mongoose; MongoDB Atlas (ap-south-1); Redis. `[CITED: .planning/research/STACK.md]`
- **Gemini SDK:** `@google/genai` 2.6.0 — narrative only, NOT numbers. `[VERIFIED: npm view @google/genai version → 2.6.0]`
- **Narrative is PRECOMPUTED** by the nightly BullMQ `narrative-batch` job. The report read path is **Redis → Mongo, NEVER a live Gemini call.** `[CITED: .planning/research/ARCHITECTURE.md §"Materialised Read Path"]`
- **Charts:** TradingView Lightweight Charts v5 (`5.2.0`). `[VERIFIED: npm view lightweight-charts version → 5.2.0]`
- **Verdict enum** (from Phase 1 COMP-01): `STRONG_SCORE | CAUTION | WEAK_SCORE` — no BUY/SELL/HOLD verbs anywhere. `[CITED: REQUIREMENTS.md COMP-01]`
- **Authenticated report variants live in this phase** (`/app/(app)/stock/[ticker]`, `/app/(app)/fund/[schemeCode]`). Public unauthenticated SEO variants are Phase 8 — both must share the same renderer.
- **`<2s` on 4G**: hard SLA from PROJECT.md and STOCK-08.

### Claude's Discretion
- Specific shadcn component composition for cards/gauge/strip (Card, Badge, Skeleton, Tooltip, Tabs, Separator, Alert).
- Whether to use `lightweight-charts-react-components 2.1.0` wrapper or raw `useEffect` integration (recommend raw — wrapper publisher provenance flagged MEDIUM by STACK.md).
- Numeric-audit tolerance (recommend strict-match for percentages and absolute currency; ±0.01 only for floating-point rounding of ratios).
- Gemini model split: 2.5 Flash for narrative, 2.5 Flash-Lite for SWOT bullets (cost optimisation).

### Deferred Ideas (OUT OF SCOPE)
- **Streaming compliance sanitiser for SSE** — Phase 7 (Ask FinSight chat). Document the contract here so Phase 7 inherits it; do not implement.
- **News in the report layout** — Phase 6 adds the news feed card. Phase 4 leaves a typed slot in `ReportDoc` for it.
- **Comparison verdict (2-3 way)** — STOCK-07 lives in Phase 7.
- **Public SEO `/stock/[ticker]` page (unauth)** — Phase 8. Phase 4 ships the auth-gated variant + the shared renderer.
- **Watchlist add/remove from report** — Phase 5.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **STOCK-01** | Stock report: FinSight Score gauge, worded verdict, precomputed one-paragraph AI summary | §"Recommended Project Structure" (`/stock/[ticker]/page.tsx`), §"Architecture Patterns — Materialised Read", §"Code Examples — Gemini structured output" |
| **STOCK-02** | Six insight cards (Score, Volatility, Profit Consistency, Event Sensitivity, SWOT, Promoter Holdings) | §"Insight Card Composition", §"Don't Hand-Roll" (gauge) |
| **STOCK-03** | Interactive price chart (1D/1W/1M/6M/1Y/5Y/MAX) | §"Code Examples — Lightweight Charts v5 timeframe switching", §"Don't Hand-Roll" (chart engine) |
| **STOCK-04** | Fundamentals strip (P/E, P/B, ROE, ROCE, Debt/Equity, Market Cap) | §"Strip Composition" |
| **STOCK-05** | Technicals strip (RSI(14), MACD signal, 50/200 DMA, Beta) | §"Strip Composition" |
| **STOCK-06** | Peer comparison vs 3 closest competitors with scores | §"Peer Card", depends on `peerSet` precomputed in Phase 3 EOD job |
| **STOCK-08** | Full report renders <2s on 4G (materialised read, no live AI) | §"Architecture Patterns — Materialised Read", §"Perf Budget" |
| **FUND-01** | Fund report: Fund Score, verdict, precomputed AI summary | §"MF Report Differences" |
| **FUND-02** | Returns vs benchmark vs category (1/3/5/10y) | §"MF Report — Returns Chart" |
| **FUND-03** | Risk metrics (Sharpe, stddev, max drawdown) | §"MF Report — Risk Strip" |
| **FUND-04** | Top-10 holdings, sector allocation, expense ratio, AUM, manager tenure | §"MF Report — Composition" |
| **FUND-05** | 3 peer funds with scores + "Better Alternatives" card when score < 6 | §"MF Report — Better Alternatives Logic" |
| **COMP-02** | Every AI-generated output passes through a single compliance interceptor before reaching the client | §"Architecture Patterns — Interceptor Chokepoint", §"Code Examples — ComplianceInterceptor skeleton" |
| **COMP-03** | Every report and returns view shows "analysis not advice" + "past performance" disclaimers | §"Disclaimer Injection", §"Security Domain" |
| **COMP-04** | AI narrative numbers are template-inserted and pass post-generation numeric audit | §"Architecture Patterns — Template-Slot", §"Code Examples — Numeric Audit" |

---

## Project Constraints (from CLAUDE.md)

> CLAUDE.md exists at repo root with the user's project profile (developer style directives) and a Developer Profile table generated by GSD. It contains no hard engineering rules specific to this codebase — engineering rules come from the user's global instructions (`~/.claude/CLAUDE.md`, `~/.claude/rules/`).

The actionable directives that **bind this phase**:

- **Universal rules:** `no-empty-catch`, `no-bare-any`, `test-file-exists` (every new source file gets a test file), `tests-with-behavior-change` (behavior changes update tests), `behavior-first-testing` (assert observable behavior, not internals), `docs-with-public-change`.
- **Backend rules:** `backend/no-console-log` (use platform logger), `backend/require-dto-validation` (NestJS `@Body()` parameters use class-validator DTO classes), `backend/multi-tenancy-scoping` (queries scoped by auth context — though this is a B2C app, `userId` from JWT must scope watchlist-coupled actions if any leak in).
- **Frontend rules:** `frontend/vue3-composition-api` is **not applicable** (we are Next.js/React, not Vue — flagged in the global ruleset but irrelevant here). `frontend/no-hardcoded-strings` (i18n) is a future concern; v1 is English-only per PROJECT.md (multi-language is V2). Treat it as a *recommendation* (centralise strings in a constants module) so a future i18n pass is cheap.
- **Security rules:** `no-hardcoded-secrets`, `auth-patterns` (auth gate uses Phase-1 JWT guard), `no-vhtml-without-sanitize` (we are React — equivalent is "never `dangerouslySetInnerHTML` without DOMPurify"; Gemini narrative is plain text → never assigned via `dangerouslySetInnerHTML`).
- **Developer profile directives** (from `/Users/milankatia/Desktop/personal/tracker/CLAUDE.md`):
  - Terse, action-oriented communication in planning docs.
  - Make a clear recommendation and proceed (this research does so on chart wrapper choice, model split, audit tolerance).
  - UI polish proactively: invest in card composition, skeleton states, gauge readability.
  - Strictly scoped changes — never modify unrelated code.

---

## Standard Stack

### Core (already locked at project level — pinned for Phase 4)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `15.5.x` | RSC + App Router for report pages | Locked. Streaming Suspense lets verdict+score paint first. `[VERIFIED: STACK.md npm verification 2026-05-27]` |
| `react` | `19.2.x` | UI runtime | Ships with Next 15.5. `[VERIFIED: STACK.md]` |
| `tailwindcss` | `4.3.0` | CSS-first styling via `@theme` | Locked. Score/grade tokens go in `@theme` block. `[VERIFIED: STACK.md]` |
| `shadcn/ui` | CLI canary (Tailwind v4 + React 19) | Card, Badge, Skeleton, Tooltip, Tabs, Separator, Alert | Locked. Component source is copied into repo. `[CITED: ui.shadcn.com/docs/tailwind-v4]` |
| `@nestjs/core` `@nestjs/common` | `11.1.24` | Backend modules, controllers, interceptors | Locked. `APP_INTERCEPTOR` token is how we register the ComplianceInterceptor globally. `[VERIFIED: npm view @nestjs/common version → 11.1.24]` |
| `@nestjs/mongoose` + `mongoose` | `11.0.x` + `9.6.x` | Report doc persistence | Locked. `ReportDoc` is a single denormalised collection. `[CITED: STACK.md]` |
| `@nestjs/bullmq` + `bullmq` | `11.0.x` + `5.77.x` | `narrative-batch` queue | Locked. Repeatable jobs trigger after `eod-recompute`. `[CITED: STACK.md]` |
| `@google/genai` | `2.6.0` | Gemini narrative + SWOT generation | Locked. Used **only** inside the `narrative-batch` job, never in a GET handler. `[VERIFIED: npm view @google/genai version → 2.6.0]` |
| `lightweight-charts` | `5.2.0` | Price chart engine | Locked v5 (v4 patterns won't compile). `[VERIFIED: npm view lightweight-charts version → 5.2.0]` |
| `class-validator` + `class-transformer` | `0.15.x` + `0.5.x` | DTO validation on every controller `@Body()` | Mandatory per platform rule `backend/require-dto-validation`. `[CITED: CLAUDE.md platform rules]` |

### Supporting (Phase 4-specific)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lightweight-charts-react-components` | `2.1.0` | React wrapper for v5 | **Optional.** Use only if team wants to skip raw imperative integration. Wrapper publisher provenance is MEDIUM per STACK.md → safer to integrate raw in a `'use client'` component with `useEffect` + cleanup. `[VERIFIED: npm view lightweight-charts-react-components version → 2.1.0]` |
| `ioredis` | matches BullMQ | Cache facade backing report hot cache | Already wired in Phase 1's CacheModule; this phase consumes it. |
| `zod` (or rely on `class-validator`) | n/a | Runtime validation of Gemini structured-JSON response | Optional — Gemini SDK enforces the `responseSchema`; a `zod` parse on the parsed JSON is belt-and-braces, recommended. `[CITED: ai.google.dev/gemini-api/docs/structured-output]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Lightweight Charts v5 (raw integration) | `lightweight-charts-react-components 2.1.0` wrapper | Wrapper is fewer LOC but adds a third-party dependency on a smaller maintainer; raw is the project default. |
| Lightweight Charts v5 | Recharts / Visx | Both heavier and not optimised for OHLC + timeframe switching. Lightweight Charts is the industry standard for financial price charts. `[ASSUMED — based on industry usage]` |
| Custom SVG gauge for score | shadcn `Progress` styled as a circular gauge OR `react-circular-progressbar` | Build custom SVG — it's one component, fully controlled, no extra dep. (See "Don't Hand-Roll" — chart engine is the only thing worth a library; a 1–10 gauge is trivial.) |
| Gemini 2.5 Flash for narrative | Gemini 2.5 Pro | Pro is 5–10× more expensive and slower; Flash is sufficient for one-paragraph templated narrative. `[CITED: PITFALLS.md Pitfall 4]` |
| Server-Side `ReportDoc` denormalisation | Multiple queries with client-side joins | Denormalisation = one Mongo find, one Redis hit, matches <2s budget. Multiple queries = waterfalls. `[CITED: PITFALLS.md Pitfall 9]` |

**Installation (additions for Phase 4 — most are already installed by Phase 1):**

```bash
# Frontend (apps/web)
pnpm add lightweight-charts@5
# Optional wrapper — skip per recommendation above
# pnpm add lightweight-charts-react-components@2

pnpm dlx shadcn@latest add card badge skeleton tooltip tabs separator alert

# Backend (apps/api) — additions, baseline from Phase 1
pnpm add @google/genai          # if not already present from Phase 1
pnpm add zod                    # optional runtime validation of Gemini JSON
```

**Version verification (2026-05-28):**
- `@google/genai` → `2.6.0` (verified via `npm view`)
- `lightweight-charts` → `5.2.0` (verified)
- `lightweight-charts-react-components` → `2.1.0` (verified)
- `@nestjs/common` → `11.1.24` (verified)
- `next` (latest) → `16.2.6` (we pin to 15.5.x per lock)

---

## Architecture Patterns

### Recommended Project Structure (Phase 4 additions)

```
apps/api/src/
├── reports/                          # NEW — orchestrates the read path
│   ├── reports.module.ts
│   ├── reports.controller.ts         # GET /reports/stock/:ticker, /reports/fund/:scheme
│   ├── reports.service.ts            # Redis → Mongo, no Gemini, no recompute
│   ├── dto/
│   │   ├── stock-report.dto.ts       # Strongly-typed response shape
│   │   └── fund-report.dto.ts
│   └── schemas/
│       ├── stock-report-doc.schema.ts  # Denormalised report document
│       └── fund-report-doc.schema.ts
├── ai/                                # FROM Phase 1 scaffolding — now FILLED
│   ├── ai.module.ts
│   ├── ai.service.ts                  # public facade — narrative(), swot()
│   ├── gemini.client.ts               # PRIVATE — never exported
│   ├── prompts/
│   │   ├── narrative.prompt.ts        # System instruction + template-slot schema
│   │   └── swot.prompt.ts
│   ├── numeric-audit.ts               # regex token extraction + verify
│   └── template-slots.ts              # placeholder → verified-value substitution
├── compliance/                        # FROM Phase 1 — interceptor goes ACTIVE
│   ├── compliance.module.ts
│   ├── compliance.interceptor.ts      # global; wraps every AI response
│   ├── compliance.sanitiser.ts        # forbidden-verb regex + replacement table
│   ├── disclaimers.constants.ts       # ANALYSIS_DISCLAIMER, PAST_PERF_DISCLAIMER
│   └── compliance.spec.ts             # fixture pack of forbidden-verb inputs
└── jobs/queues/
    └── narrative-batch.processor.ts   # NEW — runs after eod-recompute completes

apps/web/src/app/
├── (app)/                             # AUTH-GATED variants (this phase)
│   ├── stock/[ticker]/page.tsx        # RSC + Suspense streaming
│   └── fund/[schemeCode]/page.tsx
├── _components/
│   └── reports/                       # SHARED renderer (Phase 8 SEO pages also use these)
│       ├── ScoreGauge.tsx             # 'use client' for SVG animation only — no data fetch
│       ├── VerdictBadge.tsx           # server component; reads enum
│       ├── InsightCard.tsx            # shadcn Card wrapper
│       ├── PriceChart.tsx             # 'use client' — Lightweight Charts v5
│       ├── FundamentalsStrip.tsx      # server
│       ├── TechnicalsStrip.tsx        # server
│       ├── PeerCard.tsx               # server
│       ├── NarrativeBlock.tsx         # server — renders precomputed prose + cited sources
│       ├── DisclaimerFooter.tsx       # server — always rendered
│       └── ReportSkeleton.tsx         # Suspense fallback shells
└── _lib/
    └── reports/
        └── fetch.ts                   # single REST call to NestJS, typed via shared DTO

packages/shared/                       # Phase 1 monorepo
└── src/types/
    ├── stock-report.ts                # shared DTO — web AND api import this
    └── fund-report.ts
```

### Pattern 1: Materialised Read Path (the <2s SLA enforcer)

**What:** Public report endpoints do **one** Redis read (or one Mongo find on miss). Zero synchronous Gemini calls; zero score recomputation; zero external-provider calls. The full `ReportDoc` is denormalised so the page renders from a single payload.

**When to use:** Every report read. This is non-negotiable for STOCK-08.

**Example shape:**
```typescript
// packages/shared/src/types/stock-report.ts
export interface StockReportDoc {
  ticker: string;                          // canonical (e.g., "RELIANCE")
  asOf: string;                            // ISO timestamp of last EOD recompute
  dataVersionHash: string;                 // changes on every recompute → cache buster
  score: { value: number; verdict: 'STRONG_SCORE' | 'CAUTION' | 'WEAK_SCORE'; pillars: Record<string, number>; weightsVersion: string };
  fundamentals: { pe: number; pb: number; roe: number; roce: number; debtEquity: number; marketCap: number };
  technicals: { rsi14: number; macdSignal: 'bullish' | 'bearish' | 'neutral'; dma50: number; dma200: number; price: number; beta: number };
  insights: {
    volatility: { stddev1y: number };
    profitConsistency: { profitableQuartersPct: number; window: '12Q' };
    eventSensitivity: { avgAbsReturnOnResultDay: number; baseline: number };
    swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] }; // precomputed
    promoterHoldings: { latestPct: number; deltaPctVsPrevQ: number };
  };
  peers: Array<{ ticker: string; name: string; score: number }>;             // 3 peers
  narrative: { paragraph: string; citedSources: string[]; generatedAt: string; auditPassed: true };
  disclaimers: { analysis: string; pastPerformance: string };
  dataLineage: Array<{ field: string; source: string; stale: boolean }>;     // from DataIngestionModule
}
```

**Read flow:**
```
GET /reports/stock/:ticker (NestJS)
  ↓
ReportsService.get(ticker)
  ↓
Redis: `report:stock:${ticker}` (TTL = until next recompute)
  ├─ HIT → return (typical)
  └─ MISS → Mongo: stockReports.findOne({ ticker }) → set Redis → return
                       ↑
                       NEVER calls Gemini, NEVER calls Scoring, NEVER calls Yahoo
```

**Cache invalidation:** EOD recompute job, after persisting new report doc, deletes `report:stock:${ticker}` and on the web side calls `revalidateTag(`stock:${ticker}`)` via a Next.js webhook (the controller embeds `tags: [`stock:${ticker}`]` in `fetch()` options).

### Pattern 2: Precomputed Narrative Pipeline (the AI invariant enforcer)

**What:** The `narrative-batch` BullMQ queue runs after `eod-recompute` finishes for an instrument. For each instrument with a changed `dataVersionHash`, it calls `AIService.narrative(scoreInput)`, which:
1. Builds the prompt with **placeholders**, not raw numbers.
2. Calls Gemini with `responseSchema` (structured JSON output).
3. Runs `templateSlots.substitute(narrative, verifiedValues)` to inject digits.
4. Runs `numericAudit.verify(substituted, verifiedValues)` — any unexpected digit → reject + regenerate (max 3 retries with stricter prompt).
5. Passes the result to the ComplianceInterceptor (already wrapping the AIModule).
6. Persists to `StockReportDoc.narrative` and invalidates Redis.

**When to use:** Every narrative + SWOT generation. No exceptions.

### Pattern 3: ComplianceInterceptor Chokepoint (the compliance invariant enforcer)

**What:** A NestJS `Interceptor` registered globally via `APP_INTERCEPTOR`. Wraps every `Observable` returned from the AIModule facade. Operates in two modes:
- **Block mode** (default for v1): if forbidden verbs survive after sanitisation, throw `ComplianceViolationException` → caller (the narrative job) retries with a stricter prompt.
- **Replace mode** (fallback): if a single isolated forbidden token can be safely substituted (`"recommend" → "analysis suggests"`), do so and log a warning.

Always injects `disclaimers` metadata so the frontend cannot accidentally render an AI surface without them.

**When to use:** Every AI surface in the system — narrative, SWOT, news sentiment (Phase 6), chat (Phase 7). Phase 4 makes it **active** for the first two.

**Scope decision:** Register globally with `APP_INTERCEPTOR` rather than per-controller — guarantees no AI endpoint can ship without it (per ARCHITECTURE.md anti-pattern #2: "Compliance as a 'remember to call it' service").

### Pattern 4: Streaming Suspense for <2s First-Paint

**What:** The RSC report page does NOT `await` the full payload upfront. Instead, it uses Suspense boundaries to stream a layout shell + score+verdict immediately, then the cards, then the chart.

```tsx
// apps/web/src/app/(app)/stock/[ticker]/page.tsx
export default async function StockReportPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  // Single fetch — Server Component reuses across child boundaries via React cache
  return (
    <article>
      <Suspense fallback={<ScoreVerdictShell />}>
        <ScoreAndVerdict ticker={ticker} />     {/* paints first — <500ms target */}
      </Suspense>
      <Suspense fallback={<CardsShell />}>
        <InsightCards ticker={ticker} />        {/* paints second */}
      </Suspense>
      <Suspense fallback={<ChartShell />}>
        <PriceChart ticker={ticker} />          {/* 'use client'; paints last after hydration */}
      </Suspense>
      <Suspense fallback={<PeersShell />}>
        <Peers ticker={ticker} />
      </Suspense>
      <NarrativeBlock ticker={ticker} />        {/* server-rendered, no suspense — fast */}
      <DisclaimerFooter />                      {/* always rendered, server */}
    </article>
  );
}
```

Each `Suspense`'d child does its own `fetch` to the same NestJS endpoint — React Server Components dedupe identical fetches within a request via the built-in `fetch` cache, so it's still a single Redis hit at the backend.

### Pattern 5: Versioned Cache Invalidation via `dataVersionHash`

**What:** Every `ReportDoc` carries a `dataVersionHash` (already computed in Phase 3 EOD job — hash of `ScoreInput` fields that materially affect the score). Redis keys do **not** include the hash (so reads are O(1)), but on each recompute the job *unconditionally deletes* `report:stock:${ticker}` and re-warms. Next.js `revalidateTag(`stock:${ticker}`)` is called via a small `/api/internal/revalidate` route guarded by an HMAC header (job-only).

### Anti-Patterns to Avoid

- **Single big `await` in the report page** — destroys streaming; verdict can't paint first; <2s budget at risk.
- **Calling Gemini inside `ReportsController`** — instant violation of invariant #3. Linter rule: `ai/*` may not be imported into `reports/*`.
- **`dangerouslySetInnerHTML` for narrative** — narrative is plain text; render as `<p>{narrative}</p>`.
- **Storing the gauge value separately from the verdict** — single enum is the contract (COMP-01); derive gauge color from the enum, not from a separate `gradeColor` field.
- **Mutating chart instance on every prop change** — create once in `useEffect`, call `setData()` on switch; tear down in cleanup.
- **Per-card REST endpoints** — six round-trips kill the budget; one denormalised payload only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive financial price chart with OHLC + timeframe switching + crosshair | Custom canvas/SVG chart | **Lightweight Charts v5** (`lightweight-charts@5.2.0`) | 5+ years of edge cases (gap handling, holiday alignment, log/linear axes, performance with thousands of candles). Apache-2.0, 45KB. `[CITED: tradingview.github.io/lightweight-charts]` |
| Forbidden-verb detection in free text | Hand-rolled `str.includes("buy")` | **Word-boundary regex with case-insensitive flag + negation context awareness** (codified once in `compliance.sanitiser.ts`) | `str.includes` matches "buying opportunity" inside "non-buying opportunity"; word-boundary regex + negative lookbehind for "do not" is the minimum correct approach. `[ASSUMED]` |
| Structured AI output parsing | Regex over Gemini free-text | **Gemini `responseSchema` (`@google/genai`'s `responseMimeType: 'application/json'` + `responseSchema`)** | Native structured output guarantees parseability; eliminates a class of "what if Gemini wraps it in markdown" bugs. `[CITED: ai.google.dev/gemini-api/docs/structured-output]` |
| BullMQ job orchestration | Custom cron + Redis locks | **`@nestjs/bullmq` repeatable jobs + flow producer** | Already locked. Flow producer chains `eod-recompute → narrative-batch` cleanly. `[CITED: STACK.md]` |
| Cache TTL bookkeeping | Inline `redis.set(..., 'EX', N)` calls everywhere | **Phase 1's CacheModule with centralised TTL policy table** | Already exists. Phase 4 adds report TTL constants only. |
| Disclaimer rendering | Inline strings in each card | **Single `<DisclaimerFooter />` component** + `disclaimers.constants.ts` server-side | One source of truth, legal review reviews one file. |
| Skeleton loading shapes | Custom CSS animations | **shadcn `Skeleton` component** | Already in the stack; matches design tokens automatically. |
| Score gauge widget | A library (e.g., `react-gauge-chart`) | **Custom SVG component** (under 100 LOC) | A 1–10 gauge with three color zones is a 5-minute build; pulling in a chart lib is overkill. UI polish lives in our own component. (This is the *exception* to the "don't hand-roll" rule because the problem is genuinely simple and the libraries add their own opinions on animation/colors that fight Tailwind tokens.) |

**Key insight:** The two things genuinely worth a library are (a) the **chart engine** (real complexity, real edge cases) and (b) the **AI SDK with structured output + caching** (otherwise you fight token sampling). Everything else in this phase is shadcn primitives + small, focused custom components.

---

## Common Pitfalls

### Pitfall 1: AI narrative leaks a number that wasn't in `ScoreInput`

**What goes wrong:** Gemini produces "Reliance's ROE is around 14% — a healthy figure," but `ScoreInput.fundamentals.roe` is `13.7`. The "around 14%" came from token sampling, not from data. User trust + compliance breach.

**Why it happens:** Devs interpret "Gemini never generates a number" as "don't ask for a number," but feeding numbers into the prompt and letting it weave them in is re-introducing generation.

**How to avoid:**
- **Template-slot pattern:** prompt asks for `"Reliance's ROE is {{roe}} — a {{healthAdjective}} figure."` Server substitutes `{{roe}}` with `13.7` and `{{healthAdjective}}` with one of an enum based on score band.
- **Numeric audit:** after substitution, regex `/\b\d+(\.\d+)?%?\b/g` extracts every numeric token; assert each is in `Object.values(verifiedNumbers)`. Reject + regenerate on mismatch.
- Low temperature (`0.2`) for narrative generation.
- Sampled human audit: log a random 1% of generated narratives + source data daily for QA review.

**Warning signs:**
- Prompt contains "summarise these financials and mention key metrics" without a placeholder schema.
- No regex over narrative output.
- QA only reviews the score, skips the prose.

`[CITED: PITFALLS.md Pitfall 2]`

### Pitfall 2: Synchronous Gemini call on the report request path

**What goes wrong:** The report endpoint calls `gemini.generate()` to produce the narrative live. Gemini Flash latency 1–4s + render time blows the <2s SLA.

**Why it happens:** The naive flow is "fetch → generate → return." Works for one dev request; dies under load.

**How to avoid:**
- **Hard rule:** the file `ai.service.ts` may only be imported from `jobs/` (the narrative-batch processor) and `chat/` (Phase 7), never from `reports/`. Add a custom ESLint rule (`no-restricted-imports`) to enforce.
- The narrative is **already persisted** in `StockReportDoc.narrative` by the nightly job.
- p95 latency metric on `/reports/stock/:ticker` in Grafana → alert on >1.5s.

**Warning signs:** `await ai.narrative()` inside any controller; Gemini bill scales with page views, not unique tickers.

`[CITED: PITFALLS.md Pitfall 4, ARCHITECTURE.md invariant #3]`

### Pitfall 3: Forbidden verbs leak through the interceptor

**What goes wrong:** Gemini outputs "you should consider buying" — the interceptor's regex matches "buying" → replaces with "analysing" → result is now "you should consider analysing," which is grammatical but still advice-shaped ("you should").

**How to avoid:**
- Multi-layer sanitiser:
  1. **Verb blocklist** with word boundaries: `\b(buy|sell|hold|recommend|recommended|recommends|target price|stop loss|invest in)\b`
  2. **Phrase blocklist:** `you should (buy|sell|invest|consider)`, `\b(strongly|highly) suggest\b`
  3. **Pattern blocklist:** numeric target price patterns `\b(₹|Rs\.?)\s*\d+`
- **System prompt** explicitly forbids these tokens in the first place ("Do not use the words: buy, sell, hold, recommend, target price. Use analytical neutral phrasing.")
- **Fixture-based unit tests** in `compliance.spec.ts`:
  ```typescript
  const FORBIDDEN_FIXTURES = [
    "Investors should buy this stock at current levels.",
    "Target price of ₹3,200 looks achievable.",
    "We recommend holding for the long term.",
    "Strong buy signal on technicals.",
  ];
  // Each must throw ComplianceViolationException
  ```
- Block, don't replace, when in doubt. The narrative-batch job regenerates with a stricter prompt.

**Warning signs:** Interceptor only checks single words, not phrases. No fixture-based tests. "Replace" mode is the default.

`[CITED: PITFALLS.md Pitfall 1; project compliance invariant #6]`

### Pitfall 4: Chart performance — too many candles + memory leak on unmount

**What goes wrong:** "MAX" timeframe pulls 10y of daily candles (≈2,500 points) but the user toggles 1D/1W/1M rapidly. Each switch creates a new chart instance; the old one isn't disposed; memory creeps; eventually the tab is sluggish.

**How to avoid:**
- One chart instance per `PriceChart` component lifetime; on timeframe switch, call `series.setData(newData)`, NOT recreate.
- In the `useEffect` cleanup: `chart.remove()`.
- Cap MAX to ≈2,500 points (10y daily). For 5Y+1Y, downsample server-side to daily.
- Debounce timeframe switch by 150ms to absorb rapid clicks.

`[CITED: tradingview.github.io/lightweight-charts performance guide; ASSUMED on debounce timing]`

### Pitfall 5: `revalidateTag` not wired → stale reports after EOD

**What goes wrong:** EOD job updates Mongo + Redis, but Next.js's RSC fetch cache still serves yesterday's payload because no `revalidateTag` was triggered. Users see stale scores until the Next.js ISR window expires.

**How to avoid:**
- Every report `fetch()` from the RSC layer uses `next: { tags: [`stock:${ticker}`] }`.
- Add `/api/internal/revalidate` (HMAC-protected) that calls `revalidateTag(tag)`; the narrative-batch processor POSTs to it on completion.
- Smoke-test in CI: kick the job for a fake ticker, fetch the page, confirm new `dataVersionHash`.

`[CITED: nextjs.org/docs/app/api-reference/functions/revalidateTag]`

### Pitfall 6: Insight cards data-shape drift between web and api

**What goes wrong:** Backend renames `profitableQuartersPct` to `consistencyPct`; frontend still expects the old field; card shows `undefined`.

**How to avoid:**
- The `StockReportDoc` type lives in `packages/shared/src/types/stock-report.ts`; both `apps/web` and `apps/api` import it. Renaming a field breaks the build on both sides.

### Pitfall 7: "Better Alternatives" card recommends — i.e., advice

**What goes wrong:** FUND-05 says "show 3 peer funds with scores and a 'Better Alternatives' card when score < 6." Naive copy: "We recommend Fund X instead." → compliance breach.

**How to avoid:**
- Title is literally **"Higher-scoring peers"** (factual, not advisory).
- Body: "These funds in the same category have a higher FinSight Fund Score." No "you should switch," no "we recommend," no "better." (Yes, the requirement *uses* "Better Alternatives" — that's the internal feature name; the user-facing copy must be neutral. Document this divergence prominently.)

`[CITED: FUND-05; compliance invariant #5]`

---

## Runtime State Inventory

> Phase 4 is a **greenfield phase** — no renames, no existing collections to migrate from. Categories below are filled for completeness; nothing requires migration.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `stockReports` and `fundReports` Mongo collections are NEW in this phase. ScoreHistory + ScoreInput from Phase 3 are read-only inputs. | Create collections + indexes. |
| Live service config | None — no n8n, no external workflow services in scope. | None. |
| OS-registered state | None — BullMQ queues run inside the NestJS API worker; no OS-level cron. | None. |
| Secrets / env vars | `GEMINI_API_KEY` (already loaded in Phase 1 from secret manager). No new secrets. | None. |
| Build artifacts | None — no compiled packages affected. | None. |

**Nothing found in any category requires migration.** This phase introduces new collections and new queues; it modifies no existing runtime state.

---

## Code Examples

### Example 1: Gemini structured JSON output for narrative (with placeholders)

```typescript
// apps/api/src/ai/prompts/narrative.prompt.ts
import { Type } from '@google/genai';

export const NARRATIVE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    paragraph: { type: Type.STRING, description: 'Single paragraph, 3-5 sentences, with {{placeholder}} tokens for all numbers.' },
    placeholders: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'List of every placeholder used in the paragraph, e.g., ["score","pe","roe"].',
    },
    citedSources: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Data source fields the narrative draws from, e.g., ["fundamentals.roe","technicals.rsi14"].',
    },
  },
  required: ['paragraph', 'placeholders', 'citedSources'],
};

export const NARRATIVE_SYSTEM_PROMPT = `
You are a financial analysis writer for FinSight AI.

ABSOLUTE RULES:
1. Output is ANALYSIS, never ADVICE. Never use: buy, sell, hold, recommend, target price, stop loss, "you should".
2. Use the verdict vocabulary: "Strong Score", "Caution", "Weak Score".
3. NEVER write a literal number. For every number, write a placeholder: {{score}}, {{pe}}, {{roe}}, {{return1y}}, etc.
4. Use ONLY the placeholders listed in the input \`allowedPlaceholders\`.
5. The "citedSources" array must list the dotted data paths your sentence implicitly references.

Tone: factual, neutral, plain English, 3-5 sentences.
`;
```

```typescript
// apps/api/src/ai/ai.service.ts
import { GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { NARRATIVE_SCHEMA, NARRATIVE_SYSTEM_PROMPT } from './prompts/narrative.prompt';
import { substituteSlots } from './template-slots';
import { auditNumbers } from './numeric-audit';

@Injectable()
export class AiService {
  // gemini client is PRIVATE — initialised in constructor, never exposed
  private readonly gemini: GoogleGenAI;

  constructor() {
    this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async narrative(input: ScoreInput, maxRetries = 3): Promise<NarrativeResult> {
    const allowedPlaceholders = ['score','pe','pb','roe','roce','debtEquity','marketCap','rsi14','return1y','volatility1y','promoterPct'];
    const verifiedNumbers = this.buildVerifiedNumbers(input);   // { score: '7', pe: '24.3', roe: '13.7', ... }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const response = await this.gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: this.buildUserPrompt(input, allowedPlaceholders) }] },
        ],
        config: {
          systemInstruction: NARRATIVE_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: NARRATIVE_SCHEMA,
          temperature: 0.2,
        },
      });

      const parsed = JSON.parse(response.text);                  // { paragraph, placeholders, citedSources }
      const substituted = substituteSlots(parsed.paragraph, verifiedNumbers);
      const audit = auditNumbers(substituted, verifiedNumbers);

      if (audit.ok) {
        return { paragraph: substituted, citedSources: parsed.citedSources, generatedAt: new Date().toISOString(), auditPassed: true as const };
      }
      // else: retry with a stricter prompt explaining the audit failure
    }
    throw new NarrativeAuditFailedError(input.ticker);
  }
}
```

`[CITED: ai.google.dev/gemini-api/docs/structured-output for responseSchema usage; @google/genai 2.6.0 API surface]`

### Example 2: Template-slot substitution

```typescript
// apps/api/src/ai/template-slots.ts
const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

export function substituteSlots(paragraph: string, values: Record<string, string>): string {
  return paragraph.replace(PLACEHOLDER_RE, (_, key) => {
    if (!(key in values)) {
      throw new UnknownPlaceholderError(key);
    }
    return values[key];
  });
}
```

### Example 3: Post-generation numeric audit

```typescript
// apps/api/src/ai/numeric-audit.ts
const NUMBER_TOKEN_RE = /-?\d+(?:[.,]\d+)?%?/g;

export interface AuditResult {
  ok: boolean;
  unexpectedTokens: string[];
}

export function auditNumbers(narrative: string, verified: Record<string, string>): AuditResult {
  const verifiedSet = new Set(Object.values(verified));
  // Also accept the un-suffixed form (e.g., verified "13.7%" matches "13.7" in text)
  for (const v of Object.values(verified)) {
    verifiedSet.add(v.replace('%', ''));
  }
  const tokens = narrative.match(NUMBER_TOKEN_RE) ?? [];
  const unexpected = tokens.filter((t) => !verifiedSet.has(t) && !verifiedSet.has(t.replace('%', '')));
  return { ok: unexpected.length === 0, unexpectedTokens: unexpected };
}
```

### Example 4: ComplianceInterceptor skeleton

```typescript
// apps/api/src/compliance/compliance.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor, BadRequestException } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { sanitiseAndCheck } from './compliance.sanitiser';
import { ANALYSIS_DISCLAIMER, PAST_PERF_DISCLAIMER } from './disclaimers.constants';

export class ComplianceViolationException extends BadRequestException {
  constructor(public readonly forbidden: string[]) {
    super(`Compliance violation: forbidden tokens detected: ${forbidden.join(', ')}`);
  }
}

@Injectable()
export class ComplianceInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((aiOutput: AiOutput) => {
        const { sanitised, violations } = sanitiseAndCheck(aiOutput.text);
        if (violations.length > 0) {
          throw new ComplianceViolationException(violations);
        }
        return {
          text: sanitised,
          citedSources: aiOutput.citedSources,
          disclaimers: {
            analysis: ANALYSIS_DISCLAIMER,
            pastPerformance: aiOutput.touchesReturns ? PAST_PERF_DISCLAIMER : undefined,
          },
        };
      }),
    );
  }
}
```

```typescript
// apps/api/src/compliance/compliance.sanitiser.ts
const FORBIDDEN = [
  /\b(buy|sell|hold|recommend(s|ed|ation)?)\b/gi,
  /\btarget\s+price\b/gi,
  /\bstop\s+loss\b/gi,
  /\byou\s+should\s+(buy|sell|invest|consider|hold)\b/gi,
  /\b(strongly|highly)\s+suggest\b/gi,
  /(₹|Rs\.?)\s*\d+/g,                              // numeric price targets
];

export function sanitiseAndCheck(text: string): { sanitised: string; violations: string[] } {
  const violations: string[] = [];
  for (const re of FORBIDDEN) {
    const matches = text.match(re);
    if (matches) violations.push(...matches);
  }
  return { sanitised: text, violations };  // v1: block, do not auto-replace
}
```

```typescript
// apps/api/src/compliance/compliance.module.ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ComplianceInterceptor } from './compliance.interceptor';

@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: ComplianceInterceptor }],
})
export class ComplianceModule {}
```

`[CITED: docs.nestjs.com/interceptors; docs.nestjs.com/fundamentals/lifecycle-events APP_INTERCEPTOR pattern]`

### Example 5: Lightweight Charts v5 — single instance, timeframe switching

```tsx
// apps/web/src/app/_components/reports/PriceChart.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';

type Timeframe = '1D' | '1W' | '1M' | '6M' | '1Y' | '5Y' | 'MAX';

export function PriceChart({ ticker }: { ticker: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [tf, setTf] = useState<Timeframe>('1Y');

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#64748b' },
      grid: { vertLines: { visible: false }, horzLines: { color: '#1e293b' } },
      timeScale: { borderVisible: false },
      rightPriceScale: { borderVisible: false },
      height: 360,
    });
    const series = chart.addSeries(CandlestickSeries, { upColor: '#10b981', downColor: '#ef4444', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444' });
    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => chart.applyOptions({ width: containerRef.current!.clientWidth });
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();                                          // memory cleanup
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // On timeframe change, fetch + setData (do NOT recreate)
  useEffect(() => {
    if (!seriesRef.current) return;
    let cancelled = false;
    (async () => {
      const data = await fetch(`/api/proxy/prices/${ticker}?tf=${tf}`, { cache: 'force-cache' }).then((r) => r.json());
      if (!cancelled) seriesRef.current!.setData(data as Array<{ time: Time; open: number; high: number; low: number; close: number }>);
    })();
    return () => { cancelled = true; };
  }, [ticker, tf]);

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {(['1D','1W','1M','6M','1Y','5Y','MAX'] as Timeframe[]).map((t) => (
          <button key={t} onClick={() => setTf(t)} className={`px-3 py-1 rounded text-sm ${tf === t ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{t}</button>
        ))}
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
```

`[CITED: tradingview.github.io/lightweight-charts v5 docs — createChart, addSeries, CandlestickSeries import]`

### Example 6: Reports controller (NestJS) — single payload, no AI

```typescript
// apps/api/src/reports/reports.controller.ts
import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('stock/:ticker')
  async getStock(@Param('ticker') ticker: string) {
    const doc = await this.reports.getStock(ticker);    // Redis → Mongo only
    if (!doc) throw new NotFoundException(`No report for ${ticker}`);
    return doc;
  }

  @Get('fund/:schemeCode')
  async getFund(@Param('schemeCode') schemeCode: string) {
    const doc = await this.reports.getFund(schemeCode);
    if (!doc) throw new NotFoundException(`No report for ${schemeCode}`);
    return doc;
  }
}
```

### Example 7: Narrative-batch BullMQ processor

```typescript
// apps/api/src/jobs/queues/narrative-batch.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AiService } from '../../ai/ai.service';
import { ReportsService } from '../../reports/reports.service';
import { ScoringInputsService } from '../../scoring/scoring-inputs.service';

@Processor('narrative-batch', { concurrency: 4 })
export class NarrativeBatchProcessor extends WorkerHost {
  constructor(
    private readonly ai: AiService,
    private readonly reports: ReportsService,
    private readonly scoringInputs: ScoringInputsService,
  ) { super(); }

  async process(job: Job<{ ticker: string; dataVersionHash: string }>) {
    const { ticker, dataVersionHash } = job.data;
    const input = await this.scoringInputs.getLatest(ticker);
    if (input.dataVersionHash !== dataVersionHash) {
      return { skipped: 'stale-version' };                // newer recompute already ran
    }
    const narrative = await this.ai.narrative(input);     // wrapped by ComplianceInterceptor
    const swot = await this.ai.swot(input);
    await this.reports.upsertNarrative(ticker, { narrative, swot, dataVersionHash });
    await this.reports.bustCache(ticker);                 // also triggers Next.js revalidateTag
    return { ticker, ok: true };
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@google/generative-ai` SDK | `@google/genai` 2.x | Old SDK deprecated, frozen at 0.24.1 | Use the new unified SDK exclusively. `[CITED: ai.google.dev migrate guide]` |
| Lightweight Charts v4 API (`addCandlestickSeries`) | v5 API (`addSeries(CandlestickSeries)`) | v5 release (breaking) | v4 tutorials won't compile; use v5 docs only. `[CITED: tradingview.github.io/lightweight-charts]` |
| Free-text Gemini prose + post-parse | Structured JSON output via `responseSchema` | Stable in Gemini 2.5 family | Eliminates "model wrapped JSON in markdown" failure modes. `[CITED: ai.google.dev/gemini-api/docs/structured-output]` |
| Pages Router `getServerSideProps` | App Router RSC + Suspense streaming | Next.js 13+, stable in 15 | Score+verdict can paint before chart data resolves → key for <2s budget. `[CITED: nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming]` |
| Per-route revalidation hints | `revalidateTag()` (server action / route handler) | Next.js 14+ | Job-triggered invalidation is now first-class. `[CITED: nextjs.org/docs/app/api-reference/functions/revalidateTag]` |
| `text-embedding-004` | `gemini-embedding-001` @ 768 dims | Jan 14 2026 sunset of 004 | Used by Phase 6, but the dimension choice affects shared infra. `[CITED: STACK.md]` |

**Deprecated/outdated (do not use):**
- `@google/generative-ai` — deprecated.
- Lightweight Charts v4 patterns — breaking change in v5.
- `tailwind.config.js`-centric v3 setup — Tailwind v4 is CSS-first.
- Synchronous Gemini call inside a GET handler — architecture violation.
- `dangerouslySetInnerHTML` for AI text — XSS surface + bypasses compliance.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A 150ms debounce on chart timeframe switch is sufficient to absorb rapid clicks. | Common Pitfalls — Pitfall 4 | Minor — tune empirically; UX-only impact. |
| A2 | Custom SVG gauge (under 100 LOC) is preferable to a chart library for the score gauge. | Don't Hand-Roll | Low — if the custom build proves fiddly, drop in `react-circular-progressbar` (well-maintained, ~6KB). |
| A3 | Lightweight Charts can comfortably render 2,500 candles (10y daily) without performance issues. | Common Pitfalls — Pitfall 4 | Low — Lightweight Charts is built for 10K+ candles; 2,500 is well within range, but downsampling at MAX is the safe default. |
| A4 | `responseSchema` in `@google/genai` 2.6 enforces structured JSON output reliably enough that a `zod` parse is belt-and-braces, not required. | Standard Stack — `zod` | Low — adding `zod` is cheap; the assumption only affects code budget, not correctness. |
| A5 | Forbidden-verb regex with word boundaries + a small phrase blocklist is sufficient for v1 compliance interception. | Code Examples — Example 4 | MEDIUM — a determined model could phrase advice around the blocklist ("the data suggests action X is favourable"). Mitigation: fixture-based tests catch common evasions; legal review of generated samples in QA. |
| A6 | Numeric-audit tolerance: strict-match on percentage strings, ±0.01 only for floating-point ratios. | Standard Stack — Claude's Discretion | Low — tunable; document the tolerance config in `numeric-audit.ts`. |
| A7 | Gemini 2.5 Flash is sufficient quality for the one-paragraph narrative; Flash-Lite is sufficient for SWOT bullets. | Standard Stack | Low — easy to upgrade to Pro if quality complaints emerge; pure config change. |
| A8 | The peer set (3 closest competitors) is precomputed in Phase 3 EOD job and lives on `StockReportDoc.peers`. | Phase Requirements — STOCK-06 | MEDIUM — if Phase 3 did not produce this, Phase 4 needs a small backfill task. Verify in Phase 4 planning. |

---

## Open Questions

1. **Peer set computation — is it done in Phase 3 or in this phase?**
   - What we know: STOCK-06 requires 3 peers with scores; PROJECT.md and ARCHITECTURE.md describe peer selection as part of scoring.
   - What's unclear: Phase 3's REQUIREMENTS list (SCORE-01..05) does not explicitly name "compute peer set" as a deliverable.
   - Recommendation: Treat peer-set computation as part of the EOD pipeline (Phase 3 territory); if it wasn't done, add a small task in Phase 4 plan to compute it during `narrative-batch`. Verify during planning.

2. **MF "Better Alternatives" copy — exact wording for compliance.**
   - What we know: Card must not say "we recommend" or "better."
   - What's unclear: Final user-facing wording.
   - Recommendation: Use "Higher-scoring peers in the same category." Get legal review before launch.

3. **Chart data endpoint — separate from report payload or embedded?**
   - What we know: 10y daily = 2,500 candles; embedding in `ReportDoc` makes the doc large (~200KB).
   - Recommendation: Keep chart data **separate** — `/reports/stock/:ticker/prices?tf=X` — cached aggressively per `(ticker, tf)`. Report doc is small (no chart series); chart loads after first paint via Suspense.

4. **Disclaimer text — exact phrasing.**
   - What we know: Two disclaimers needed (analysis + past performance).
   - Recommendation: Use SEBI-aligned boilerplate. Get legal sign-off in Wave 0; centralise in `disclaimers.constants.ts`.

5. **`narrative-batch` failure budget — how many narrative-audit rejections before we ship a fallback placeholder?**
   - Recommendation: 3 retries with stricter prompt; on final fail, ship a deterministic templated fallback ("FinSight Score: {{score}}. Verdict: {{verdict}}.") + alert ops.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (LTS) | Build & run | ✓ | v24.14.0 | — |
| pnpm | Monorepo install | ✓ | (via Volta) | npm |
| Docker | Local Redis + Mongo containers | ✓ | (Homebrew) | Cloud-only dev (Atlas free tier + Upstash) |
| `redis-cli` | Local debugging | ✓ | 8.6.1 | — |
| `mongosh` | Local Mongo debugging | ✗ | — | Atlas web UI; install via `brew install mongosh` |
| Gemini API key | `narrative-batch` job | UNKNOWN (project secret) | — | If missing in dev, stub `AiService` with a fixture narrative behind `process.env.AI_STUB === 'true'` |
| Atlas cluster (ap-south-1) | `stockReports` / `fundReports` collections | Should be provisioned in Phase 1 | — | Local Mongo via Docker for dev; Atlas required for staging/prod |
| Upstash / Redis Cloud | Report hot cache + BullMQ | Should be provisioned in Phase 1 | — | Local Redis Docker for dev |

**Missing dependencies with no fallback:** None blocking Phase 4 plan-writing. Phase 1 must have provisioned the cluster + Gemini key.

**Missing dependencies with fallback:**
- `mongosh` (developer-experience-only) — installable on demand.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (NestJS default, already configured in Phase 1) for `apps/api`; Vitest + React Testing Library for `apps/web` |
| Config file | `apps/api/jest.config.js` (NestJS-generated), `apps/web/vitest.config.ts` (Wave 0 if not present) |
| Quick run command | `pnpm --filter @finsight/api test -- --testPathPattern reports\|ai\|compliance` |
| Full suite command | `pnpm test` (turbo runs all packages) |
| E2E smoke | Playwright (Wave 0 — set up minimal harness) — load `/stock/RELIANCE`, assert verdict badge + chart canvas + disclaimer text |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STOCK-01 | GET `/reports/stock/:ticker` returns score+verdict+narrative | integration | `pnpm --filter api test reports.controller.spec` | ❌ Wave 0 |
| STOCK-02 | `ReportDoc.insights` contains all six insight objects with required fields | unit (DTO) | `pnpm --filter api test stock-report.dto.spec` | ❌ Wave 0 |
| STOCK-03 | `PriceChart` mounts, switches timeframe, calls `setData`, cleans up on unmount | unit (RTL) | `pnpm --filter web test PriceChart.test` | ❌ Wave 0 |
| STOCK-04 / STOCK-05 | Strip components render all six / four metrics with tooltips | unit | `pnpm --filter web test FundamentalsStrip.test TechnicalsStrip.test` | ❌ Wave 0 |
| STOCK-06 | `ReportDoc.peers.length === 3` enforced | unit (DTO + integration) | `pnpm --filter api test reports.service.spec` | ❌ Wave 0 |
| STOCK-08 | Report endpoint p95 latency < 1500ms under k6 load test (100 RPS, warm cache) | perf (manual-on-demand) | `k6 run perf/report-load.js` | ❌ Wave 0 (optional — manual sign-off acceptable) |
| FUND-01..05 | Fund report parallel to stock | integration + unit | `pnpm --filter api test reports.fund.spec` | ❌ Wave 0 |
| COMP-02 | Every AI response goes through `ComplianceInterceptor` — verified by spying on `AiService.narrative` and asserting `ComplianceInterceptor.intercept` was called | unit | `pnpm --filter api test compliance.interceptor.spec` | ❌ Wave 0 |
| COMP-02 (chokepoint) | No file outside `jobs/` and `chat/` imports `ai.service` | static (ESLint) | `pnpm lint` (custom `no-restricted-imports` rule) | ❌ Wave 0 |
| COMP-03 | `ReportDoc.disclaimers` always non-empty; `<DisclaimerFooter />` always renders | unit + RTL | `pnpm test DisclaimerFooter.test` | ❌ Wave 0 |
| COMP-04 | Fixture pack of malicious narratives (forbidden verbs, invented numbers) all rejected | unit | `pnpm --filter api test compliance.sanitiser.spec ai.numeric-audit.spec` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter <package> test -- --findRelatedTests <changed-files>` (quick — under 10s).
- **Per wave merge:** `pnpm test` (full suite — under 5min on cold cache).
- **Phase gate:** Full suite green + manual k6 p95 < 1.5s on `/reports/stock/:ticker` (warm cache, 100 RPS) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `apps/api/src/reports/reports.controller.spec.ts` — covers STOCK-01, FUND-01
- [ ] `apps/api/src/reports/reports.service.spec.ts` — Redis hit, Mongo miss-fallback, peer-count invariant
- [ ] `apps/api/src/ai/numeric-audit.spec.ts` — fixture pack of mismatched narratives
- [ ] `apps/api/src/ai/template-slots.spec.ts` — substitution, unknown placeholder throws
- [ ] `apps/api/src/compliance/compliance.interceptor.spec.ts` — block-on-violation, disclaimer injection
- [ ] `apps/api/src/compliance/compliance.sanitiser.spec.ts` — fixture pack of forbidden-verb narratives
- [ ] `apps/web/src/app/_components/reports/PriceChart.test.tsx` — RTL + Lightweight Charts mock
- [ ] `apps/web/src/app/_components/reports/ScoreGauge.test.tsx`
- [ ] `apps/web/src/app/_components/reports/DisclaimerFooter.test.tsx`
- [ ] `apps/web/vitest.config.ts` + `setup.ts` — if not present from earlier phases
- [ ] `apps/api/src/.eslintrc.*` custom rule: `no-restricted-imports` for `ai.service` outside `jobs/` and `chat/`
- [ ] `perf/report-load.js` — k6 script (optional but recommended) for STOCK-08

---

## Security Domain

> `security_enforcement` is not explicitly disabled in `.planning/config.json` → treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Phase 1's JWT auth + `JwtAuthGuard` on `/reports/*` (auth-gated variant). Public SEO variant (Phase 8) skips guard. |
| V3 Session Management | yes (inherited) | HttpOnly + Secure + SameSite=Strict cookies from Phase 1. |
| V4 Access Control | yes (lightweight) | Reports are non-tenant data (every authenticated user can fetch any ticker). No row-level scoping needed for the report doc itself. Watchlist (Phase 5) introduces per-user scoping. |
| V5 Input Validation | yes | `class-validator` DTOs on every controller; ticker / scheme code regex-validated (`^[A-Z0-9.&-]+$` for tickers; `^\d+$` for scheme codes). |
| V6 Cryptography | partial | Gemini API key in secret manager (Phase 1); HMAC on `/api/internal/revalidate` (job → web). |
| V7 Error Handling | yes | No stack traces in 5xx responses; `ComplianceViolationException` returns generic 400 to client (full detail only in server logs). |
| V8 Data Protection | yes | No PII in `StockReportDoc`. AI narrative + numbers are non-PII. Logs must redact `userId` / `email` when joined with watchlist scopes (Phase 5 concern). |
| V12 Files / Resources | n/a | No file upload in this phase. |
| V14 Configuration | yes | All env vars validated at boot via Phase 1's config schema. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt-injection via user-supplied data in `ScoreInput` (unlikely in Phase 4 — inputs are from internal scoring) | Tampering | `ScoreInput` is internally produced by Phase 3; no user-supplied strings enter the Gemini prompt. Still: validate input shape with class-validator before prompt assembly. |
| AI output containing forbidden verbs reaching the client | Compliance / Reputation | Global `ComplianceInterceptor`; fixture-based unit tests; block + retry on violation. |
| Wrong numeric token in narrative misleading users | Information Disclosure / Misrepresentation | Template-slot + post-gen numeric audit; reject + regenerate. |
| Gemini API key leak | Information Disclosure | Secret manager (Phase 1); `no-hardcoded-secrets`; never reachable from `apps/web` client bundle. |
| Stale data shown as live (cache not invalidated) | Information Disclosure / Trust | `revalidateTag` triggered by EOD job; per-doc `asOf` timestamp visibly rendered. |
| Cross-site scripting via narrative content | Tampering | Render as plain text via React (`<p>{narrative}</p>`); never `dangerouslySetInnerHTML`. |
| Rate-limit exhaustion via report scraping | DoS | Phase 1 rate limiter on `/reports/*` (per-IP + per-user). |
| HMAC bypass on `/api/internal/revalidate` | Elevation of Privilege | Constant-time HMAC compare; secret only in job worker + Next.js server. |

---

## Sources

### Primary (HIGH confidence)
- `npm` registry live query (2026-05-28) — verified: `@google/genai` 2.6.0, `lightweight-charts` 5.2.0, `lightweight-charts-react-components` 2.1.0, `@nestjs/common` 11.1.24
- ai.google.dev/gemini-api/docs/structured-output — `responseSchema`, `responseMimeType: 'application/json'`, `@google/genai` Type enum
- ai.google.dev/gemini-api/docs/text-generation — system instructions, temperature, model selection (2.5 Flash vs Flash-Lite vs Pro)
- ai.google.dev/gemini-api/docs/caching — implicit caching min token thresholds (Flash 1024 / Pro 2048); 60min default TTL, no upper bound
- tradingview.github.io/lightweight-charts — v5 API (createChart, addSeries(CandlestickSeries), setData, remove), official React integration guidance via raw `useEffect`
- docs.nestjs.com/interceptors — Interceptor implementation + `APP_INTERCEPTOR` global registration
- docs.nestjs.com/techniques/queues — `@nestjs/bullmq` Processor + WorkerHost
- nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming — Suspense streaming in App Router
- nextjs.org/docs/app/api-reference/functions/revalidateTag — tag-based cache invalidation
- `.planning/research/ARCHITECTURE.md` — materialised read path, AIModule facade, ComplianceInterceptor invariants
- `.planning/research/PITFALLS.md` — AI number leakage (Pitfall 2), sync Gemini on read (Pitfall 4), advice-language baked in (Pitfall 1)
- `.planning/research/STACK.md` — locked package versions
- `.planning/PROJECT.md` — invariants, performance budget, compliance contract
- `.planning/REQUIREMENTS.md` — STOCK-01..06, STOCK-08, FUND-01..05, COMP-02..04 definitions

### Secondary (MEDIUM confidence)
- `lightweight-charts-react-components` v2.1.0 — wrapper exists; publisher provenance flagged in STACK.md → recommend raw integration as default

### Tertiary (LOW confidence)
- Specific Gemini 2.5 Flash latency numbers (1–4s) — directional, from PITFALLS.md. Verify with empirical p95 in CI.
- 150ms debounce timing for chart timeframe switch — UX rule-of-thumb; validate via user testing.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — every version verified live against npm registry (2026-05-28); SDK choices locked by project invariants.
- Architecture Patterns: HIGH — derived directly from ARCHITECTURE.md's load-bearing decisions (materialised read, AIModule facade, interceptor chokepoint); no new structural choices required.
- AI Pipeline (template-slot + numeric audit): HIGH — pattern is explicit in PITFALLS.md Pitfall 2 with the exact mitigation; Code Examples translate it directly to `@google/genai` 2.6 API.
- ComplianceInterceptor: HIGH on shape (NestJS interceptor pattern is well-documented); MEDIUM on regex completeness (assumption A5 — fixture tests are required to catch evasions).
- Lightweight Charts integration: HIGH — official v5 API; raw integration is the documented zero-risk path.
- Pitfalls: HIGH (number drift, sync LLM on read, forbidden-verb leak all confirmed against PITFALLS.md + project invariants).

**Research date:** 2026-05-28
**Valid until:** 2026-06-27 (stable libs, ~30 days). Gemini SDK and `lightweight-charts` move quickly — re-verify versions if planning slips by more than a month.
