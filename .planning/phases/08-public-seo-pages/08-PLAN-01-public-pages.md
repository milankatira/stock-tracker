---
phase: 08-public-seo-pages
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/eslint.config.mjs
  - apps/web/vitest.config.ts
  - apps/web/__tests__/stock-page.no-gemini.test.tsx
  - apps/web/__tests__/stock-page.ssr.test.tsx
  - apps/web/__tests__/fund-page.no-gemini.test.tsx
  - apps/web/__tests__/seo/jsonld.test.ts
  - apps/web/__tests__/seo/canonical.test.ts
  - apps/web/__tests__/fixtures/instrument-master.ts
  - apps/web/src/lib/seo/jsonld.ts
  - apps/web/src/lib/seo/canonical.ts
  - apps/web/src/lib/seo/disclaimers.ts
  - apps/web/src/lib/data/stock-report.ts
  - apps/web/src/lib/data/fund-report.ts
  - apps/web/src/lib/data/instrument-master.ts
  - apps/web/src/components/seo/json-ld.tsx
  - apps/web/src/components/compliance/disclaimers.tsx
  - apps/web/src/components/reports/public-stock-report-view.tsx
  - apps/web/src/components/reports/public-fund-report-view.tsx
  - apps/web/src/components/reports/stub-page.tsx
  - apps/web/src/app/stock/[ticker]/page.tsx
  - apps/web/src/app/fund/[schemeCode]/page.tsx
  - .github/workflows/ci.yml
autonomous: true
requirements:
  - SEO-01
  - SEO-02
  - SEO-03
  - SEO-04

must_haves:
  truths:
    - "A crawler hitting /stock/RELIANCE sees the FinSight Score, verdict label, and one-line summary in view-source HTML"
    - "A crawler hitting /fund/120503 sees the FinSight Fund Score and verdict in view-source HTML"
    - "Every public stock and fund page contains the analysis-not-advice + past-performance disclaimers in server-rendered HTML"
    - "Every public page emits inline JSON-LD with Corporation (or FinancialProduct) + Article + BreadcrumbList — NO Review/Rating blocks"
    - "Every public page emits canonical URL using the NSE symbol when a stock is dual-listed NSE+BSE"
    - "Every public page emits OG title/description/url/type=article + Twitter card meta tags"
    - "Long-tail tickers/funds with no precomputed report render a robots:{index:false} stub and queue an ad-hoc compute job"
    - "Page render never instantiates the Gemini SDK (`@google/genai`)"
  artifacts:
    - path: "apps/web/src/app/stock/[ticker]/page.tsx"
      provides: "Public stock page RSC with generateStaticParams + dynamicParams=true + revalidate=86400 + generateMetadata"
      contains: "generateStaticParams"
    - path: "apps/web/src/app/fund/[schemeCode]/page.tsx"
      provides: "Public fund page RSC, same structure as stock"
      contains: "generateStaticParams"
    - path: "apps/web/src/lib/seo/jsonld.ts"
      provides: "Typed JSON-LD builders (Corporation, FinancialProduct, Article, BreadcrumbList) via schema-dts"
      exports: ["buildStockJsonLd", "buildFundJsonLd", "buildBreadcrumbJsonLd"]
    - path: "apps/web/src/lib/seo/canonical.ts"
      provides: "Canonical URL builder with NSE preference for dual-listed stocks"
      exports: ["buildCanonicalStockUrl", "buildCanonicalFundUrl"]
    - path: "apps/web/src/components/compliance/disclaimers.tsx"
      provides: "Server-rendered disclaimer block (analysis-not-advice + past-performance)"
    - path: "apps/web/eslint.config.mjs"
      provides: "no-restricted-imports rule banning @google/genai under app/stock/** and app/fund/**"
      contains: "no-restricted-imports"
    - path: "apps/web/__tests__/stock-page.no-gemini.test.tsx"
      provides: "Vitest assertion that page render never instantiates Gemini SDK"
      contains: "vi.mock('@google/genai'"
    - path: ".github/workflows/ci.yml"
      provides: "CI grep step that exits nonzero if @google/genai is imported under apps/web/src/app/stock or app/fund"
      contains: "git grep"
  key_links:
    - from: "apps/web/src/app/stock/[ticker]/page.tsx"
      to: "apps/web/src/lib/data/stock-report.ts (getStockReportFromMaterialisedStore)"
      via: "server-side await call with cacheTags"
      pattern: "getStockReportFromMaterialisedStore\\("
    - from: "apps/web/src/app/stock/[ticker]/page.tsx"
      to: "apps/web/src/components/seo/json-ld.tsx"
      via: "JSX import + render of Corporation + Article + BreadcrumbList blocks"
      pattern: "<JsonLd"
    - from: "apps/web/src/app/stock/[ticker]/page.tsx"
      to: "apps/web/src/components/compliance/disclaimers.tsx"
      via: "JSX import + render"
      pattern: "<Disclaimers"
    - from: "apps/web/src/app/fund/[schemeCode]/page.tsx"
      to: "apps/web/src/lib/data/fund-report.ts (getFundReportFromMaterialisedStore)"
      via: "server-side await call with cacheTags"
      pattern: "getFundReportFromMaterialisedStore\\("
---

<objective>
Build the two public, indexable, server-rendered pages that are the SEO distribution moat for FinSight AI:
`/stock/[ticker]` and `/fund/[schemeCode]`. Each page must (1) render full HTML server-side from the precomputed
materialised store, (2) emit JSON-LD structured data (Corporation/FinancialProduct + Article + BreadcrumbList — and
explicitly NO Review/Rating), canonical URLs (NSE-preferred for dual-listed stocks), OG and Twitter card meta tags,
(3) carry the analysis-not-advice + past-performance disclaimers in server-rendered HTML, and (4) be protected by a
three-layer guard ensuring no live Gemini call ever happens on the request path.

Purpose: Every requirement in this phase (SEO-01..04) traces to "complete HTML to crawlers, fast, compliance-safe,
zero-LLM on the read path." The page architecture exists to serve those four invariants without exception.

Output:
- Two RSC pages with generateStaticParams (top-N) + on-demand ISR long-tail (revalidate=86400)
- generateMetadata with canonical, OG, Twitter; robots:{index:false} on stubs
- Inline JSON-LD via schema-dts typed builders (Corporation/FinancialProduct + Article + BreadcrumbList)
- Public report view components (auth-stripped variants — NO Ask FinSight teaser, NO regenerate button)
- ESLint no-restricted-imports + CI grep + Vitest mock-throw — three-layer Gemini ban
- Wave-0 test scaffolding for all SEO-01..04 verifications
</objective>

<decision_coverage_matrix>
Verify every locked requirement is delivered FULL in this plan or in Plan 02:

| REQ-ID | Plan | Task | Full/Partial | Notes |
|--------|------|------|--------------|-------|
| SEO-01 | 01   | 1,2  | Full         | Wave-0 SSR smoke test + stock page render with view-source HTML proof |
| SEO-02 | 01   | 1,3  | Full         | Wave-0 SSR smoke test + fund page render with view-source HTML proof |
| SEO-03 | 01   | 2,3  | Partial (page-level) | Canonical + OG + Twitter meta + inline JSON-LD blocks done here. Plan 02 finishes SEO-03 with sitemap.ts + robots.ts + opengraph-image.tsx |
| SEO-04 | 01   | 1,2,3 | Full        | Materialised-store reads only + disclaimers in SSR HTML + three-layer Gemini ban (ESLint + CI grep + Vitest mock-throw) |

Plan 02 finishes SEO-03 (sitemap, robots, OG image bytes) and adds the revalidate webhook for cache freshness.
NO partial deliveries. NO "v1 / placeholder" scope reductions.
</decision_coverage_matrix>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/research/SUMMARY.md
@.planning/research/PITFALLS.md
@.planning/phases/08-public-seo-pages/08-RESEARCH.md

<!-- Forward-declared dependencies on prior phases. Plan 01 assumes these exist; Plan 02 wires the EOD/narrative job call sites. -->
<!-- Phase 4 contract: precomputed report doc with computedAt, exchange, verdictLabel, oneLineSummary, symbol, name, score for stocks; schemeName, fundHouse, schemeCode, score, verdictLabel, computedAt for funds. -->
<!-- Phase 2 contract: instrument master listing top-N tickers (NIFTY 500) and top funds with NSE-preference flag for dual-listed. -->

<interfaces>
<!--
Key contracts the executor builds against. These DTOs are produced by Phase 4 (reports) and consumed here.
If any field is missing in Phase 4's actual DTO, add a TODO note pointing back to Phase 4 — do NOT invent fields.
-->

Expected shared DTO (packages/shared/src/reports.ts — created in Phase 4):
```typescript
export interface StockReport {
  symbol: string                 // e.g. "RELIANCE"
  name: string                   // e.g. "Reliance Industries Ltd"
  exchange: 'NSE' | 'BSE'        // canonical listing — NSE preferred
  bseCode?: string               // optional dual-listing BSE numeric code
  score: number                  // 1..10
  verdictLabel: 'Strong Score' | 'Caution' | 'Weak Score'
  oneLineSummary: string         // precomputed by narrative-batch
  narrative: string              // precomputed paragraph; passed through compliance interceptor
  computedAt: string             // ISO timestamp
  // ...other fields from Phase 4 (insight cards, fundamentals strip, etc.)
}

export interface FundReport {
  schemeCode: string             // AMFI scheme code, e.g. "120503"
  schemeName: string
  fundHouse: string
  score: number
  verdictLabel: 'Strong Score' | 'Caution' | 'Weak Score'
  oneLineSummary: string
  narrative: string
  computedAt: string
  // ...other fields from Phase 4
}

export type VerdictLabel = StockReport['verdictLabel']
```

Expected materialised-store read functions (apps/web/src/lib/data/* — created in this plan):
```typescript
// Reads precomputed report from NestJS API (preferred) OR direct Mongo (alternative).
// Resolution decision: see OPEN QUESTIONS — defaults to NestJS internal HTTP per research recommendation.
// Tagged with Next.js cache tags so revalidateTag works.
export function getStockReportFromMaterialisedStore(
  ticker: string,
  options: { cacheTags: string[] }
): Promise<StockReport | null>

export function getFundReportFromMaterialisedStore(
  schemeCode: string,
  options: { cacheTags: string[] }
): Promise<FundReport | null>

export function getTopNTickers(n: number): Promise<Array<{ symbol: string }>>
export function getTopNFundSchemeCodes(n: number): Promise<Array<{ schemeCode: string }>>
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wave-0 — install three-layer Gemini ban + SSR test scaffolds + fixtures</name>
  <files>
    apps/web/eslint.config.mjs,
    apps/web/vitest.config.ts,
    apps/web/__tests__/stock-page.no-gemini.test.tsx,
    apps/web/__tests__/fund-page.no-gemini.test.tsx,
    apps/web/__tests__/stock-page.ssr.test.tsx,
    apps/web/__tests__/seo/jsonld.test.ts,
    apps/web/__tests__/seo/canonical.test.ts,
    apps/web/__tests__/fixtures/instrument-master.ts,
    .github/workflows/ci.yml,
    apps/web/package.json
  </files>
  <action>
Install Wave-0 scaffolding for SEO-01..04 BEFORE any production code lands. This task creates the failing tests + guards that subsequent tasks will satisfy.

**Step A — ESLint `no-restricted-imports` (Layer 1 of Gemini ban):**
In `apps/web/eslint.config.mjs` (flat config), add a scoped rule that fails the build if `@google/genai` (or any `**/ai/gemini*` path) is imported under `src/app/stock/**` or `src/app/fund/**`:

```js
// apps/web/eslint.config.mjs (add to existing flat config — do NOT replace)
export default [
  // ...existing config...
  {
    files: ['src/app/stock/**', 'src/app/fund/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@google/genai', '**/ai/gemini*'], message: 'No live Gemini on public SEO pages. Read from materialised store only.' },
        ],
      }],
    },
  },
]
```

**Step B — CI grep step (Layer 2 of Gemini ban):**
In `.github/workflows/ci.yml` (create or extend), add a step:

```yaml
- name: Forbid live Gemini imports under public route trees
  run: |
    if git grep -nE "@google/genai|gemini" -- apps/web/src/app/stock apps/web/src/app/fund; then
      echo "::error::Live Gemini import detected in public route tree. Public pages must read materialised store only."
      exit 1
    fi
```

If `ci.yml` does not exist, create it minimally with `pull_request` + `push` triggers and `pnpm install && pnpm --filter @finsight/web lint && pnpm --filter @finsight/web test -- --run` jobs before the grep step.

**Step C — Vitest test scaffolds (Layer 3 of Gemini ban + SSR/JSON-LD/canonical assertions):**
Verify `apps/web/vitest.config.ts` exists from Phase 1; if missing, create it with `defineConfig({ test: { environment: 'jsdom', globals: true, include: ['__tests__/**/*.test.{ts,tsx}'] } })`.

Add `vitest`, `@vitejs/plugin-react`, `jsdom` to `apps/web/package.json` devDependencies if missing.

Create the Vitest test files. Each is a RED test until the corresponding production code is written in Tasks 2 and 3:

`apps/web/__tests__/stock-page.no-gemini.test.tsx`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { stockFixture } from './fixtures/instrument-master'

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => {
    throw new Error('Gemini must not be instantiated during public stock page render (SEO-04)')
  }),
}))

vi.mock('@/lib/data/stock-report', () => ({
  getStockReportFromMaterialisedStore: vi.fn(async () => stockFixture),
}))

describe('GET /stock/[ticker] — Gemini ban (SEO-04)', () => {
  it('renders without instantiating @google/genai', async () => {
    const StockPage = (await import('@/app/stock/[ticker]/page')).default
    // Next 15.5: params is a sync object
    const result = await StockPage({ params: { ticker: 'RELIANCE' } })
    expect(result).toBeDefined()
  })
})
```

`apps/web/__tests__/fund-page.no-gemini.test.tsx` — same shape, asserts on the fund page.

`apps/web/__tests__/stock-page.ssr.test.tsx` (SEO-01 + SEO-04b disclaimers):
- Render `<StockPage params={{ ticker: 'RELIANCE' }} />` (RSC) via `react-dom/server` `renderToStaticMarkup`
- Assert HTML contains: "FinSight Score", the score number, "Strong Score|Caution|Weak Score", "Analysis, not investment advice", "Past performance"
- Assert HTML contains `<script type="application/ld+json">` with `"@type":"Corporation"` AND `"@type":"Article"` AND `"@type":"BreadcrumbList"`
- Assert HTML contains `<link rel="canonical"` (parsed from `<head>` injected by Next metadata in test setup — if Next test runtime is unavailable, assert the value returned by `generateMetadata` directly)

`apps/web/__tests__/seo/jsonld.test.ts` (SEO-03a):
- Import `buildStockJsonLd`, `buildFundJsonLd`, `buildBreadcrumbJsonLd` from `@/lib/seo/jsonld`
- Assert stock builder returns `[corp, article]` where `corp['@type'] === 'Corporation'`, `corp.tickerSymbol === 'NSE RELIANCE'` (space-separated per schema.org)
- Assert fund builder returns `[product, article]` where `product['@type'] === 'FinancialProduct'`
- Assert breadcrumb builder returns 3 ListItem entries
- **Negative assertion:** assert no key named `'review'` or `'aggregateRating'` appears anywhere in the returned objects (SEBI-safety)

`apps/web/__tests__/seo/canonical.test.ts` (SEO-03b):
- `buildCanonicalStockUrl({ symbol: 'RELIANCE', exchange: 'NSE' })` === `'https://finsight.ai/stock/RELIANCE'`
- `buildCanonicalStockUrl({ symbol: '500325', exchange: 'BSE', nseSymbol: 'RELIANCE' })` === `'https://finsight.ai/stock/RELIANCE'` (NSE-preferred for dual-listed)
- `buildCanonicalStockUrl({ symbol: 'TATAINFRA', exchange: 'BSE' })` === `'https://finsight.ai/stock/TATAINFRA'` (BSE-only, fall back to BSE)

`apps/web/__tests__/fixtures/instrument-master.ts`:
```ts
export const stockFixture = {
  symbol: 'RELIANCE',
  name: 'Reliance Industries Ltd',
  exchange: 'NSE',
  score: 8,
  verdictLabel: 'Strong Score',
  oneLineSummary: 'Diversified conglomerate with consistent profit growth and strong promoter holding.',
  narrative: 'Reliance Industries delivered ... (precomputed paragraph) ...',
  computedAt: '2026-05-27T18:00:00.000Z',
}

export const fundFixture = {
  schemeCode: '120503',
  schemeName: 'Parag Parikh Flexi Cap Fund Direct Growth',
  fundHouse: 'PPFAS Mutual Fund',
  score: 9,
  verdictLabel: 'Strong Score',
  oneLineSummary: 'Consistent outperformance vs Nifty 500 TRI with disciplined risk management.',
  narrative: 'Parag Parikh Flexi Cap ... (precomputed paragraph) ...',
  computedAt: '2026-05-27T18:00:00.000Z',
}

export const dualListedFixture = {
  symbol: '500325',
  exchange: 'BSE' as const,
  nseSymbol: 'RELIANCE',
  // ...other fields populated by tests as needed
}

export const longTailUnknownFixture = null  // simulates "no report yet"
```

**Why this is Task 1, not later:** Per role rules, every `<verify>` must have an automated command. Tasks 2 and 3 need these tests to exist BEFORE their production code lands so the RED → GREEN cycle works. ESLint config and CI grep are the structural guardrails — they must be active when the first `import` line is written.
  </action>
  <verify>
    <automated>cd apps/web && pnpm install && pnpm test -- --run 2>&1 | tee /tmp/wave0.log; grep -q "no-gemini" /tmp/wave0.log && grep -q "ssr" /tmp/wave0.log && grep -q "jsonld" /tmp/wave0.log && grep -q "canonical" /tmp/wave0.log</automated>
  </verify>
  <done>
- `apps/web/vitest.config.ts` exists and `pnpm --filter @finsight/web test -- --run --reporter=verbose` lists all 5 test files (they fail RED — that is expected; Tasks 2 and 3 turn them GREEN)
- `apps/web/eslint.config.mjs` contains the `no-restricted-imports` rule scoped to `src/app/stock/**` and `src/app/fund/**`
- `.github/workflows/ci.yml` contains the `git grep` step that exits nonzero on a Gemini import in the public route trees
- `apps/web/__tests__/fixtures/instrument-master.ts` exports `stockFixture`, `fundFixture`, `dualListedFixture`, `longTailUnknownFixture`
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build /stock/[ticker] RSC page + SEO libs + public report view (SEO-01, SEO-03 page-level, SEO-04)</name>
  <files>
    apps/web/src/app/stock/[ticker]/page.tsx,
    apps/web/src/lib/seo/jsonld.ts,
    apps/web/src/lib/seo/canonical.ts,
    apps/web/src/lib/seo/disclaimers.ts,
    apps/web/src/lib/data/stock-report.ts,
    apps/web/src/lib/data/instrument-master.ts,
    apps/web/src/components/seo/json-ld.tsx,
    apps/web/src/components/compliance/disclaimers.tsx,
    apps/web/src/components/reports/public-stock-report-view.tsx,
    apps/web/src/components/reports/stub-page.tsx,
    apps/web/package.json
  </files>
  <behavior>
    - GET /stock/RELIANCE returns 200 with full HTML containing "FinSight Score", "8/10" (from fixture), "Strong Score", oneLineSummary, narrative
    - HTML contains exactly THREE `<script type="application/ld+json">` blocks: Corporation, Article, BreadcrumbList — NO Review, NO Rating, NO aggregateRating
    - generateMetadata returns canonical `https://finsight.ai/stock/RELIANCE` for the NSE listing
    - generateMetadata returns canonical `https://finsight.ai/stock/RELIANCE` even when the route param is `500325` (BSE dual-listing → canonical prefers NSE)
    - generateMetadata returns `openGraph.type === 'article'`, `openGraph.siteName === 'FinSight AI'`, and `twitter.card === 'summary_large_image'`
    - generateMetadata returns `robots: { index: false, follow: true }` when the report is not in the materialised store
    - generateStaticParams returns ≥500 entries (NIFTY 500 — assumes Phase 2 instrument master is populated; if not, returns top available with a TODO note)
    - dynamicParams === true (long-tail tickers render on-demand)
    - revalidate === 86400 (24h safety floor; Plan 02 wires the precise revalidateTag webhook)
    - Public report view contains the analysis-not-advice disclaimer AND past-performance disclaimer in SSR HTML
    - Page renders without instantiating `@google/genai` (Layer 3 of Gemini ban — Vitest mock-throw passes)
    - Long-tail unknown ticker (`getStockReportFromMaterialisedStore` returns null) renders the StubPage with `robots:{index:false}` metadata and enqueues an ad-hoc compute job (fire-and-forget; no await on compute)
  </behavior>
  <action>
**IMPORTANT — Honor constraints:**
- Next.js 15.5.x API only: `revalidateTag(tag)` is single-argument; dynamic-route `params` is a SYNC object (NOT a Promise). Do not use the 16+ async-params signature.
- No `'use client'` anywhere in this file tree — the page is a pure Server Component.
- NEVER import `@google/genai` — ESLint will fail the build under `src/app/stock/**`.
- Reuse Phase 4 components only via auth-stripped variants. Do NOT import `<StockReportView>` if it transitively pulls Gemini; build `<PublicStockReportView>` fresh in this task (subset: hero, score gauge, verdict, oneLineSummary, narrative, fundamentals strip, technicals strip, peers, news headlines — NO Ask FinSight teaser, NO regenerate button, NO admin tooltips).

**Step A — Install schema-dts:**
```
pnpm --filter @finsight/web add schema-dts@1.1.5
```

**Step B — `apps/web/src/lib/seo/disclaimers.ts` (single source of truth):**
```ts
export const ANALYSIS_DISCLAIMER = 'Analysis, not investment advice. FinSight AI is not a SEBI-registered Research Analyst or Investment Adviser. Information provided is for educational purposes only.'
export const PAST_PERF_DISCLAIMER = 'Past performance is not indicative of future returns. Mutual fund investments are subject to market risks. Read all scheme-related documents carefully.'
```

**Step C — `apps/web/src/components/compliance/disclaimers.tsx` (pure RSC, no `'use client'`):**
```tsx
import { ANALYSIS_DISCLAIMER, PAST_PERF_DISCLAIMER } from '@/lib/seo/disclaimers'

export function Disclaimers({ context }: { context: 'report' | 'fund-report' }) {
  return (
    <aside aria-label="Compliance disclaimers" className="mt-12 border-t pt-6 text-sm text-muted-foreground">
      <p className="mb-2"><strong>Disclaimer:</strong> {ANALYSIS_DISCLAIMER}</p>
      <p>{PAST_PERF_DISCLAIMER}</p>
    </aside>
  )
}
```

**Step D — `apps/web/src/lib/seo/canonical.ts`:**
```ts
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://finsight.ai'

export function buildCanonicalStockUrl(report: { symbol: string; exchange: 'NSE' | 'BSE'; nseSymbol?: string }) {
  // Dual-listed: prefer NSE symbol
  if (report.exchange === 'BSE' && report.nseSymbol) {
    return `${SITE}/stock/${report.nseSymbol}`
  }
  return `${SITE}/stock/${report.symbol}`
}

export function buildCanonicalFundUrl(report: { schemeCode: string }) {
  return `${SITE}/fund/${report.schemeCode}`
}
```

**Step E — `apps/web/src/lib/seo/jsonld.ts` (typed via schema-dts; NO Review/Rating):**
Implement `buildStockJsonLd`, `buildFundJsonLd`, `buildBreadcrumbJsonLd` exactly per the research patterns (Pattern 3 in `08-RESEARCH.md`). For stocks: `Corporation` with `tickerSymbol: 'NSE RELIANCE'` (space-separated exchange + symbol per schema.org Corporation spec) + `Article` with `headline`, `datePublished`, `dateModified`, `author`, `publisher`, `about: corp`. For funds: `FinancialProduct` + `Article`. Breadcrumb: 3-level list (Home → Stocks/Funds → Instrument Name).

**Step F — `apps/web/src/components/seo/json-ld.tsx`:**
```tsx
export function JsonLd({ data }: { data: object | object[] }) {
  const json = Array.isArray(data) ? data.map((d) => JSON.stringify(d)).join('\n') : JSON.stringify(data)
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
```

**Step G — `apps/web/src/lib/data/stock-report.ts` + `apps/web/src/lib/data/instrument-master.ts`:**
Per OPEN QUESTION 1 in 08-RESEARCH.md, the recommended path is internal NestJS HTTP call (one Mongo client, single source of truth, easy to mock). Implement with `fetch(`${API_BASE}/reports/stock/${ticker}`, { next: { tags: options.cacheTags, revalidate: 86400 }, headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET! } })`. Returns the StockReport DTO from `packages/shared`. If the API returns 404, return `null` (signals long-tail / not yet computed).

`getTopNTickers(n)` calls `${API_BASE}/instruments/top?type=stock&n=${n}` → returns `Array<{ symbol: string }>`.

Mark these calls with `next: { tags: [...], revalidate: 86400 }` so Plan 02's `revalidateTag` webhook can invalidate precisely.

**If the cross-phase NestJS endpoints don't exist yet at execute time:** leave a TODO in the function body pointing at Phase 4 + Phase 2 deliverables, and have the function read a fixture from `__tests__/fixtures/instrument-master.ts` so the page still renders during Phase 8 development. Mark the TODO as a Phase-4/Phase-2 dependency in the SUMMARY.

**Step H — `apps/web/src/components/reports/public-stock-report-view.tsx`:**
A new Server Component (NOT a re-export of Phase 4's auth-gated version). Renders: score gauge (visual, no Gemini), verdict label, oneLineSummary, narrative (already sanitised by Phase 4 compliance interceptor), six insight cards (data-only, no interactive controls that pull Gemini), fundamentals strip, technicals strip, peer comparison links (3 internal anchors `<a href="/stock/...">` — same tab, no `target="_blank"`). Explicitly NO Ask FinSight teaser, NO regenerate button, NO admin tooltips. NO import of `@google/genai` or anything matching `**/ai/gemini*`.

**Step I — `apps/web/src/components/reports/stub-page.tsx`:**
Renders for long-tail tickers/funds with no report yet. Copy: "We're computing analysis for {ticker} — refresh in a minute. Meanwhile, explore similar instruments." + CTA back to search. NO score, NO verdict, NO JSON-LD entity block (Article + BreadcrumbList still OK so crawlers see structure).

**Step J — `apps/web/src/app/stock/[ticker]/page.tsx`:**
The page itself. Implement per Pattern 1 + Pattern 2 in 08-RESEARCH.md, with these exact contracts:
- `export async function generateStaticParams()` → returns NIFTY 500 (≈500 tickers) from instrument master; if fewer available at execute time, return what exists with a TODO comment
- `export const dynamicParams = true`
- `export const revalidate = 86400`
- `export async function generateMetadata({ params }: { params: { ticker: string } }): Promise<Metadata>` → produces title, description, alternates.canonical, openGraph, twitter, robots. For stubs (report === null), `robots: { index: false, follow: true }`.
- Default export: async RSC. Validates `params.ticker` against `/^[A-Z0-9-]{1,15}$/` (uppercase + alphanumeric + dash, bounded length — per Security Domain V5 in research). If invalid, call `notFound()` from `next/navigation`. Then fetches report, renders `<JsonLd>` blocks (Corporation, Article, BreadcrumbList) + `<PublicStockReportView>` + `<Disclaimers context="report" />`. If report is null, render `<StubPage type="stock" identifier={ticker} />` and (fire-and-forget) call an internal endpoint to enqueue ad-hoc compute (`fetch(`${API_BASE}/jobs/ad-hoc-compute/stock/${ticker}`, { method: 'POST' }).catch(() => {})`).

**Step K — Environment variables:**
Add to `apps/web/.env.example` (create if missing):
```
NEXT_PUBLIC_SITE_URL=https://finsight.ai
API_BASE=http://localhost:4000           # NestJS dev URL
INTERNAL_API_SECRET=                     # rotated per env; loaded from secret manager in prod
```
  </behavior>
  <verify>
    <automated>cd apps/web && pnpm test -- --run __tests__/stock-page.no-gemini.test.tsx __tests__/stock-page.ssr.test.tsx __tests__/seo/jsonld.test.ts __tests__/seo/canonical.test.ts && pnpm lint && git grep -nE "@google/genai|gemini" -- src/app/stock || echo "GREP OK (zero matches)"</automated>
  </verify>
  <done>
- All four Vitest tests scoped to stock + SEO libs pass (GREEN)
- `pnpm --filter @finsight/web lint` passes — ESLint `no-restricted-imports` rule active and no violations
- `git grep -nE "@google/genai|gemini" -- apps/web/src/app/stock` returns ZERO matches
- `pnpm --filter @finsight/web dev &` followed by `curl -s http://localhost:3000/stock/RELIANCE` returns HTML containing: "FinSight Score", "Strong Score", "Analysis, not investment advice", "Past performance", `<script type="application/ld+json">`, `"@type":"Corporation"`, `"@type":"Article"`, `"@type":"BreadcrumbList"`, `<link rel="canonical"`, `<meta property="og:type" content="article"`, `<meta name="twitter:card"`
- `curl -s http://localhost:3000/stock/UNKNOWN9999` returns the stub page (no JSON-LD entity block) AND the response includes `<meta name="robots" content="noindex">` (or equivalent — check Next 15.5 robots metadata output)
- `curl -s http://localhost:3000/stock/500325` (BSE dual-listing) returns `<link rel="canonical" href="https://finsight.ai/stock/RELIANCE">`
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Build /fund/[schemeCode] RSC page + public fund report view (SEO-02, SEO-03 page-level, SEO-04)</name>
  <files>
    apps/web/src/app/fund/[schemeCode]/page.tsx,
    apps/web/src/lib/data/fund-report.ts,
    apps/web/src/components/reports/public-fund-report-view.tsx,
    apps/web/__tests__/fund-page.ssr.test.tsx,
    apps/web/__tests__/seo/canonical.test.ts
  </files>
  <behavior>
    - GET /fund/120503 returns 200 with full HTML containing "FinSight Fund Score", "9/10" (from fixture), "Strong Score", schemeName, narrative
    - HTML contains exactly THREE `<script type="application/ld+json">` blocks: FinancialProduct, Article, BreadcrumbList — NO Review, NO Rating, NO aggregateRating
    - generateMetadata returns canonical `https://finsight.ai/fund/120503`
    - generateMetadata returns `openGraph.type === 'article'`, `twitter.card === 'summary_large_image'`
    - generateMetadata returns `robots: { index: false, follow: true }` when the report is not in the materialised store
    - generateStaticParams returns ≥2000 entries (top funds from instrument master; fall back to what exists with TODO)
    - dynamicParams === true, revalidate === 86400
    - Public fund view contains the analysis-not-advice + past-performance disclaimers in SSR HTML
    - Page renders without instantiating `@google/genai`
    - schemeCode param validated against `/^[0-9]{1,7}$/` before any DB lookup (V5 Input Validation)
  </behavior>
  <action>
Mirror Task 2 for the fund route. The contract is identical in structure; the differences are:

1. **Param validation:** `params.schemeCode` against `/^[0-9]{1,7}$/` (AMFI codes are numeric, ≤7 digits per current data). If invalid, `notFound()`.
2. **DTO:** `FundReport` (not `StockReport`) — see `<interfaces>` block above.
3. **JSON-LD:** `buildFundJsonLd(report)` → `FinancialProduct + Article`, plus `buildBreadcrumbJsonLd(report)` with "Mutual Funds" as level 2.
4. **Canonical:** `buildCanonicalFundUrl(report)` — no dual-listing complexity (one schemeCode per fund variant).
5. **Public fund view (`public-fund-report-view.tsx`):** subset of Phase 4's fund report — Fund Score gauge, verdict, oneLineSummary, narrative, returns vs benchmark vs category (1y/3y/5y/10y), risk metrics (Sharpe, std dev, max drawdown), top-10 holdings, sector allocation, expense ratio, AUM, manager tenure, 3 peer funds (internal `<a href="/fund/...">`), "Better Alternatives" card when score < 6. NO Ask FinSight teaser. NO Gemini import.
6. **Data fetcher (`apps/web/src/lib/data/fund-report.ts`):** mirror of `stock-report.ts` — calls NestJS internal HTTP `GET /reports/fund/:schemeCode` with cache tags `[`fund:${schemeCode}`, 'fund-report']`. Returns `FundReport | null`.
7. **Tests:**
   - `apps/web/__tests__/fund-page.ssr.test.tsx`: same shape as stock SSR test — view-source assertions for fund score, disclaimers, JSON-LD types (FinancialProduct + Article + BreadcrumbList).
   - Extend `apps/web/__tests__/seo/canonical.test.ts` with one fund-canonical assertion: `buildCanonicalFundUrl({ schemeCode: '120503' })` === `'https://finsight.ai/fund/120503'`.

**Do NOT skip:** add a regression assertion in `__tests__/seo/jsonld.test.ts` (extend it from Task 1) that `buildFundJsonLd` returns a `FinancialProduct` block with `provider.name === fundHouse` and that the returned objects contain no `review` or `aggregateRating` keys (SEBI safety).

**Stub UX:** for `getFundReportFromMaterialisedStore` returning null, render `<StubPage type="fund" identifier={schemeCode} />` and enqueue ad-hoc compute fire-and-forget.

**ESLint guard:** the rule is already scoped to `src/app/fund/**` from Task 1; verify by running lint after this task lands.
  </action>
  <verify>
    <automated>cd apps/web && pnpm test -- --run __tests__/fund-page.no-gemini.test.tsx __tests__/fund-page.ssr.test.tsx __tests__/seo/jsonld.test.ts __tests__/seo/canonical.test.ts && pnpm lint && git grep -nE "@google/genai|gemini" -- src/app/fund || echo "GREP OK (zero matches)"</automated>
  </verify>
  <done>
- Fund Vitest tests pass (GREEN)
- `pnpm --filter @finsight/web lint` passes
- `git grep -nE "@google/genai|gemini" -- apps/web/src/app/fund` returns zero matches
- `pnpm --filter @finsight/web dev &` + `curl -s http://localhost:3000/fund/120503` returns HTML containing: "FinSight Fund Score", "Strong Score", schemeName, narrative, "Analysis, not investment advice", "Past performance", `<script type="application/ld+json">`, `"@type":"FinancialProduct"`, `"@type":"Article"`, `"@type":"BreadcrumbList"`, `<link rel="canonical" href="https://finsight.ai/fund/120503">`
- `curl -s http://localhost:3000/fund/9999999` (unknown) returns stub page with `<meta name="robots" content="noindex">`
- Full Vitest suite for `apps/web` passes; ESLint clean; CI grep step (added in Task 1) returns zero matches across both stock and fund route trees
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| crawler → /stock/* and /fund/* (Next.js RSC) | Untrusted user-agent reads public pages; no auth; rate-limit at CDN/edge |
| /stock/[ticker] and /fund/[schemeCode] path params → instrument-master DB lookup | Untrusted path segment crosses into DB; must be validated before any query |
| apps/web → NestJS internal API (materialised report read) | Internal service-to-service; protected by `INTERNAL_API_SECRET` header |
| Public page → @google/genai (FORBIDDEN crossing) | This boundary must never be crossed; enforced by ESLint + CI grep + Vitest |
| Public page → Phase 4 compliance-sanitised narrative (inherited) | Narrative arrives pre-sanitised (compliance interceptor at write time); read path inherits the guarantee |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-01 | Tampering | `[ticker]` path param | mitigate | Validate against `/^[A-Z0-9-]{1,15}$/` before DB lookup; invalid → `notFound()`. Implemented in Task 2 page.tsx. |
| T-08-02 | Tampering | `[schemeCode]` path param | mitigate | Validate against `/^[0-9]{1,7}$/` before DB lookup; invalid → `notFound()`. Implemented in Task 3 page.tsx. |
| T-08-03 | Tampering | Stored narrative content (could contain forbidden BUY/SELL verbs if compliance interceptor was bypassed) | accept (inherited) | Phase 4's NestJS ComplianceInterceptor sanitises at write time. Public page only reads. Verify by integration test pulling a known sanitised doc. No new mitigation needed here — but failure mode is documented. |
| T-08-04 | Information Disclosure | `INTERNAL_API_SECRET` leak via NEXT_PUBLIC_* exposure | mitigate | Secret loaded from `process.env.INTERNAL_API_SECRET` only (NOT `NEXT_PUBLIC_*`). Server-side only. ESLint rule banning `NEXT_PUBLIC_INTERNAL_*` patterns optional — already covered by code review. |
| T-08-05 | Information Disclosure | Stack traces leaked from /stock or /fund | mitigate | Use Next.js `error.tsx` boundary with generic error message; do not leak server-side errors. Set `NEXT_TELEMETRY_DISABLED=1` in prod. |
| T-08-06 | Denial of Service | Crawler floods long-tail tickers, triggering many ad-hoc compute enqueues | mitigate | Compute enqueue is fire-and-forget; NestJS-side job dedup + rate-limit (per ticker, once per 24h). This phase only enqueues — Phase 3/4 must dedupe. |
| T-08-07 | Repudiation | None applicable (public, anonymous reads — no actions to repudiate) | accept | N/A |
| T-08-08 | Elevation of Privilege | Crawler accesses auth-gated app variant of report via /stock/* | mitigate | Public route tree uses `<PublicStockReportView>` (new, auth-stripped) — does NOT import the app-gated `<StockReportView>`. ESLint rule could optionally enforce no import of `@/components/app/**` under `app/stock/**`. |
| T-08-09 | Compliance / Spoofing | Public HTML missing "Analysis, not advice" disclaimer (regulatory violation) | mitigate | `<Disclaimers>` is a pure Server Component rendered in every page tree (stub and real). CI smoke test (Task 1) asserts presence in view-source HTML. |
| T-08-10 | Compliance | Page emits machine-readable `Rating` or `Review` JSON-LD for the FinSight Score | mitigate | Builders in `lib/seo/jsonld.ts` only emit `Corporation`/`FinancialProduct` + `Article` + `BreadcrumbList`. Vitest negative assertion (Task 1) checks for absence of `review`/`aggregateRating` keys. |
| T-08-11 | Information Disclosure (via SDK abuse) | Live Gemini call on render leaks API key usage patterns + introduces latency tied to user requests | mitigate | THREE-layer guard: (Layer 1) ESLint `no-restricted-imports` on `src/app/stock/**` and `src/app/fund/**`; (Layer 2) CI grep step in `.github/workflows/ci.yml`; (Layer 3) Vitest test mocking `@google/genai` with throwing constructor — render must not call it. |
</threat_model>

<verification>
Phase-level checks (run after Task 3):

- [ ] `pnpm --filter @finsight/web test -- --run` — all SSR, JSON-LD, canonical, Gemini-ban tests GREEN
- [ ] `pnpm --filter @finsight/web build` — build succeeds; output shows ≥500 prerendered routes under `/stock/` and ≥2000 under `/fund/` (or available cohort with a documented TODO if instrument master is empty)
- [ ] `pnpm --filter @finsight/web lint` — clean; no-restricted-imports rule active for both route trees
- [ ] CI grep step (run locally): `git grep -nE "@google/genai|gemini" apps/web/src/app/stock apps/web/src/app/fund` returns ZERO matches
- [ ] Manual smoke: `pnpm --filter @finsight/web dev` + `curl -s http://localhost:3000/stock/RELIANCE | grep -E "(FinSight Score|application/ld\+json|rel=\"canonical\"|Analysis, not investment advice|Past performance)"` — all 5 patterns match
- [ ] Manual smoke: `curl -s http://localhost:3000/fund/120503 | grep -E "(FinSight Fund Score|application/ld\+json|FinancialProduct|Analysis, not investment advice|Past performance)"` — all 5 patterns match
- [ ] Manual smoke: `curl -s http://localhost:3000/stock/UNKNOWN9999 | grep -E "(noindex|We're computing)"` — stub renders with noindex
- [ ] Negative JSON-LD: `curl -s http://localhost:3000/stock/RELIANCE | grep -E "(aggregateRating|\"@type\":\"Review\"|\"@type\":\"Rating\")"` — ZERO matches (SEBI safety)
</verification>

<success_criteria>
1. SEO-01: `/stock/[ticker]` ships, view-source contains FinSight Score + narrative + JSON-LD + canonical + OG/Twitter meta + disclaimers. Top-N pre-rendered at build; long-tail on-demand ISR.
2. SEO-02: `/fund/[schemeCode]` ships, view-source identical-shape proofs for Fund Score.
3. SEO-03 (page-level): inline JSON-LD blocks per page = Corporation (stocks) or FinancialProduct (funds) + Article + BreadcrumbList, canonical via `<link rel="canonical">` with NSE preference for dual-listed stocks, OG + Twitter meta tags via `generateMetadata`. *Plan 02 finishes SEO-03 with sitemap.ts + robots.ts + opengraph-image.tsx.*
4. SEO-04: Materialised-store reads only (no live Gemini, no live external data); three-layer Gemini ban (ESLint + CI grep + Vitest mock-throw) all green; disclaimers present in server-rendered HTML.
5. Decision coverage matrix: all four REQ-IDs delivered Full across Plan 01 (with Plan 02 closing SEO-03 sitemap/robots/OG bytes + cache freshness).
6. NO `Review` / `Rating` / `aggregateRating` JSON-LD anywhere — explicit Vitest negative assertion + manual curl grep both confirm.
</success_criteria>

<output>
After completion, create `.planning/phases/08-public-seo-pages/08-01-SUMMARY.md` covering:
- Files created (paths + line counts)
- Tests passing (count and names)
- Three-layer Gemini ban: confirm ESLint config, CI grep, Vitest mock-throw all active
- Curl smoke output for /stock/RELIANCE and /fund/120503 (paste 10-line excerpts showing JSON-LD + disclaimers)
- TODOs flagged for Phase 4 (DTO field gaps) and Phase 2 (instrument master gaps) if any
- Open questions resolved during execution (apps/web data path chosen, OG strategy chosen, hosting target)
</output>
