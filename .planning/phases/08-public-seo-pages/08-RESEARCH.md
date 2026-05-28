# Phase 8: Public SEO Pages - Research

**Researched:** 2026-05-28
**Domain:** Next.js 15 App Router SSG + on-demand ISR for public, indexable per-stock / per-fund pages backed by a precomputed materialised store
**Confidence:** HIGH

## Summary

Phase 8 ships the SEO distribution moat: every stock (`/stock/[ticker]`) and every fund (`/fund/[schemeCode]`) gets a public, server-rendered, indexable page. The page reuses the Phase 4 report renderer with auth gating stripped, reads exclusively from the **materialised store** (Mongo precomputed report doc, warmed in Redis) and **never** triggers a live Gemini call or live external data fetch on the request path. Top-N tickers/funds are pre-rendered at build time via `generateStaticParams`; the long tail uses on-demand ISR with `dynamicParams = true` and `export const revalidate = 86400`. Cache invalidation is wired by the NestJS EOD recompute / narrative-batch jobs calling a Next.js Route Handler that runs `revalidateTag(`stock:${ticker}`)`.

Two findings change the prescription from the focus_areas brief and warrant explicit attention from the planner:

1. **No Review/Rating JSON-LD for the FinSight Score.** Google's official rich-result documentation does not list financial products in the supported item types for Review/Rating snippets [CITED: developers.google.com/search/docs/appearance/structured-data/review-snippet]. Combined with SEBI's Dec 2024 stance that AI-based analytical tools fall under RA oversight, machine-readable `Rating` markup on a stock edges from "analysis" toward "recommendation" — exactly the line PROJECT.md tells us to stay behind. Use `Corporation` + `tickerSymbol` for the entity and `Article` for the analysis prose; skip `Review`/`Rating`.
2. **Next.js 15.5 vs 16 API drift.** The repo is locked to Next.js 15.5.x. `revalidateTag(tag)` is single-argument in 15.5; the two-argument `revalidateTag(tag, profile)` and `{ expire: 0 }` immediate-expire pattern are 16+ [CITED: nextjs.org/docs/app/api-reference/functions/revalidateTag]. Dynamic-route `params` are a sync object in 15.5; they become a `Promise` in 16+ [CITED: nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image version history]. Code examples below use the 15.5 signatures.

**Primary recommendation:** Treat the public page as a thin server-rendered wrapper around the existing precomputed report DTO. Build the route, the metadata, the JSON-LD, the sitemap, the robots file, and the revalidate webhook — and enforce the "no live Gemini" invariant with both an ESLint boundary and a CI grep, because this is the highest-blast-radius pitfall in the phase.

## User Constraints (from CONTEXT.md)

> No `08-CONTEXT.md` exists for this phase. Constraints below are derived from the orchestrator's `<locked_decisions_no_relitigation>` block, project-level PROJECT.md, the global SUMMARY.md/PITFALLS.md/STACK.md, and CLAUDE.md.

### Locked Decisions (do not re-litigate)

- **Stack:** Next.js 15 App Router + React Server Components + shadcn/ui + Tailwind CSS v4. Pin Next.js to `15.5.x` (not 16).
- **Reuse:** Reuse the Stock/MF report renderer from Phase 4 with auth gating stripped. No new report visual is built in this phase.
- **Materialised reads only:** The public page MUST NEVER trigger a live Gemini call or a live data fetch on the request path. Every byte of report content is read from the precomputed Mongo document (warmed in Redis).
- **JSON-LD structured data + canonical URLs + OG/Twitter cards** are in scope.
- **Routes:** `/stock/[ticker]/page.tsx`, `/fund/[schemeCode]/page.tsx` — public, no auth middleware.
- **Pre-render strategy:** `generateStaticParams()` for top-N (NIFTY 500 stocks + top ~2000 funds); long tail handled via on-demand ISR (`dynamicParams = true` + `export const revalidate = 86400`).
- **Invalidation:** `revalidateTag()` triggered by EOD recompute / narrative-batch jobs via a NestJS-to-Next.js webhook with a shared secret (HMAC).
- **NSE canonical:** When the same company exists on NSE and BSE, the canonical URL is the NSE variant.
- **Compliance:** All disclaimers in SSR HTML (indexable). Forbidden-verb compliance interceptor lives in NestJS (Phase 4) and gates every AI surface before persistence — public page inherits that guarantee because it reads the already-sanitised document. No BUY/SELL/HOLD anywhere.

### Claude's Discretion

- ISR `revalidate` window for long-tail pages (defaulting to 86400s = 24h, matching the EOD recompute cadence).
- OG image strategy (per-route generated via `opengraph-image.tsx` + `next/og` `ImageResponse`, or static fallback).
- Webhook auth mechanism (HMAC SHA-256 with constant-time comparison recommended over query-string secret).
- Internal-linking density on peer comparisons (3 peer links is the Phase 4 default — reuse).
- Sector hub pages — recommended deferred to a Phase 8.5 / future phase, not in scope here.

### Deferred Ideas (OUT OF SCOPE)

- Sector hub pages (`/sector/[id]`) — Phase 8.5 or later.
- News article pages with their own URLs — currently embedded in the report; no separate `/news/[id]` route.
- Multi-language SEO (`hreflang`) — PRD V2 (Hindi/Marathi/etc.), defer.
- Sitemap auto-submission to Google Search Console — manual one-time setup, not code.
- AMP versions of pages — Google deprioritised AMP, not worth the build cost.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEO-01 | Each stock has a public, server-rendered, indexable page (`/stock/[ticker]`) with full HTML in view-source | RSC by default emits server HTML; `generateStaticParams` pre-renders top-N; on-demand ISR for the long tail. Verified via `curl ... \| grep "FinSight Score"`. |
| SEO-02 | Each fund has a public, server-rendered page (`/fund/[schemeCode]`) | Identical pattern to SEO-01 with `[schemeCode]` segment driven by the AMFI scheme code from the instrument master (Phase 2). |
| SEO-03 | Public pages emit JSON-LD structured data, canonical URLs, and OG/Twitter cards | `generateMetadata` for canonical + OG + Twitter; `<script type="application/ld+json">` inline in the RSC tree for JSON-LD (Corporation + Article + BreadcrumbList). |
| SEO-04 | Public pages read from the materialised store (no live Gemini) and carry compliance disclaimers | Two clauses: (a) Mongo-only fetch verified by Gemini-client mock asserting zero calls + ESLint boundary banning `@google/genai` imports in `app/stock/**` and `app/fund/**`; (b) disclaimers rendered server-side in the page layout, present in view-source. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `15.5.18` (latest 15.x) | App Router, RSC, ISR, Metadata API, file-conventions for sitemap/robots/OG | Locked; v15.5 is the stable line shadcn/React 19 targets. [VERIFIED: npm registry, STACK.md] |
| `react` | `19.2.x` | RSC runtime | Pairs with Next 15.5. [VERIFIED: STACK.md] |
| `tailwindcss` | `4.3.0` | Styling for the page | Locked. CSS-first config. [VERIFIED: STACK.md] |
| `next/og` (`ImageResponse`) | bundled with Next 15.5 | Dynamic OG image generation per route | Native to Next; Satori-based Edge-runtime image rendering. [CITED: nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image] |
| `next/cache` (`revalidateTag`, `revalidatePath`) | bundled with Next 15.5 | On-demand invalidation called from webhook Route Handler | Stable since Next 13.4; 15.5 uses single-arg signature. [CITED: nextjs.org/docs/app/api-reference/functions/revalidateTag] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `schema-dts` | `1.1.5` | TypeScript-typed Schema.org JSON-LD authoring | Build JSON-LD blocks with compile-time validation; avoids hand-crafting object literals and getting property names wrong. [VERIFIED: npm registry, May 2026] |
| `node:crypto` (built-in) | n/a | HMAC SHA-256 for the revalidate webhook signature | No third-party dep; `crypto.timingSafeEqual` for constant-time comparison. |
| `lhci` (Lighthouse CI, `@lhci/cli`) | `0.15.x` | Per-PR Lighthouse runs in CI for LCP/CLS/INP targets | Optional but recommended; gates Core Web Vitals regressions. [VERIFIED: github.com/GoogleChrome/lighthouse-ci] |

### Already-in-repo (from prior phases — do NOT re-install)

- `next`, `react`, `tailwindcss`, shadcn components — Phase 1.
- Report DTO / `StockReport` / `FundReport` types in `packages/shared` — Phase 4.
- Mongo client, Redis client, NestJS API surface for `GET /reports/stock/:ticker` and `GET /reports/fund/:schemeCode` — Phase 4.
- BullMQ `narrative-batch` and `eod-recompute` jobs — Phase 3/4. Phase 8 adds a *call site* in these jobs that invokes the Next.js revalidate webhook.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `generateStaticParams` + on-demand ISR | `dynamic = 'force-static'` + empty `generateStaticParams` returning `[]` (pure on-demand) | Skips build-time SSG entirely; first crawler hit on every page pays the cold render. Worse for top tickers; fine if the universe of pages is huge. We have a finite NIFTY 500 + top funds list, so pre-render. [CITED: nextjs.org/docs/app/api-reference/functions/generate-static-params] |
| `revalidateTag` from NestJS webhook | Time-based `export const revalidate = 86400` only | Pure time-based works but stale window can be up to 24h after recompute. Tag-based invalidation gives near-real-time freshness when scores change. Recommendation: use both — `revalidate = 86400` as the floor, `revalidateTag` as the precise trigger. |
| `schema-dts` typed JSON-LD | Hand-written object literals | `schema-dts` catches misnamed properties (e.g. `tickerSymbol` vs `ticker`) at build time. Worth the small bundle/dev cost. |
| Per-route `opengraph-image.tsx` (dynamic) | Static `opengraph-image.png` fallback per layout | Dynamic gives "Stock Name + Score" branded card per ticker. Static is simpler. Recommendation: dynamic for top N at build time, static fallback for the long tail (the dynamic OG route is statically optimised when `params` is known to `generateStaticParams`). |

**Installation:**

```bash
pnpm add schema-dts            # in apps/web
pnpm add -D @lhci/cli          # in repo root or apps/web for CI
# next/og, next/cache, revalidateTag, sitemap.ts, robots.ts, opengraph-image.tsx all ship with Next 15.5 — no extra install
```

**Version verification (run before locking versions in package.json):**

```bash
npm view next version
npm view react version
npm view tailwindcss version
npm view schema-dts version
npm view @lhci/cli version
```

Last verified 2026-05-28: `next@15.5.18` (16.2.6 latest overall — do NOT use), `schema-dts@1.1.5`. [VERIFIED: nextjs.org docs page metadata says `version: 16.2.6, lastUpdated: 2026-05-27` for upstream — the v15 line is in maintenance, APIs in this research apply.]

## Architecture Patterns

### Recommended Project Structure

```
apps/web/src/
├── app/
│   ├── stock/
│   │   └── [ticker]/
│   │       ├── page.tsx              # RSC; calls API; renders report
│   │       └── opengraph-image.tsx   # dynamic OG card per ticker
│   ├── fund/
│   │   └── [schemeCode]/
│   │       ├── page.tsx
│   │       └── opengraph-image.tsx
│   ├── api/
│   │   └── revalidate/
│   │       └── route.ts              # NestJS webhook target; HMAC-verified; calls revalidateTag
│   ├── sitemap.ts                    # dynamic sitemap from instrument master
│   └── robots.ts                     # allow all; sitemap link
├── components/
│   └── reports/                      # imported from Phase 4 — auth-stripped variant
└── lib/
    ├── seo/
    │   ├── jsonld.ts                 # typed JSON-LD builders (schema-dts)
    │   ├── canonical.ts              # canonical URL builder (NSE-preference rule)
    │   └── disclaimers.ts            # disclaimer strings (single source of truth, copied/imported from Phase 1)
    └── revalidate-secret.ts          # HMAC verifier (used in api/revalidate/route.ts)
```

### Pattern 1: SSG top-N + on-demand ISR long-tail

**What:** Pre-render the top tickers/funds at build time via `generateStaticParams`; for everything else, render on the first crawler hit and cache the result for `revalidate` seconds.

**When to use:** Always for this phase. Build-time render gives best TTFB and Lighthouse score for the pages that matter most; on-demand ISR covers the long tail without exploding build time.

**Example:**

```tsx
// app/stock/[ticker]/page.tsx
// Source: nextjs.org/docs/app/api-reference/functions/generate-static-params
// Source: nextjs.org/docs/app/guides/incremental-static-regeneration

import { notFound } from 'next/navigation'
import { getStockReportFromMaterialisedStore } from '@/lib/data/stock-report'
import { getTopNTickers } from '@/lib/data/instrument-master'
import { StockReportView } from '@/components/reports/stock-report-view'
import { JsonLd } from '@/components/seo/json-ld'
import { buildStockJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo/jsonld'
import { Disclaimers } from '@/components/compliance/disclaimers'

// Pre-render NIFTY 500 at build time
export async function generateStaticParams() {
  const tickers = await getTopNTickers(500)
  return tickers.map((ticker) => ({ ticker }))
}

// Long-tail tickers render on first request and are cached
export const dynamicParams = true

// Cache the on-demand render for 24h (matches EOD recompute cadence;
// revalidateTag webhook can invalidate earlier when scores actually change)
export const revalidate = 86400

// Note: in Next 15.5, params is a sync object (NOT a Promise — that's 16+)
export default async function StockPage({ params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase()

  // SINGLE materialised read. NO live Gemini. NO live Yahoo.
  // Fetch is tagged so revalidateTag(`stock:${ticker}`) invalidates this exact page.
  const report = await getStockReportFromMaterialisedStore(ticker, {
    cacheTags: [`stock:${ticker}`, 'stock-report'],
  })

  if (!report) {
    // Long-tail ticker that hasn't been computed yet:
    // render a graceful stub + enqueue an ad-hoc compute job (fire-and-forget).
    // DO NOT block the request on compute.
    return <StockStubPage ticker={ticker} />
  }

  return (
    <>
      <JsonLd data={buildStockJsonLd(report)} />
      <JsonLd data={buildBreadcrumbJsonLd(report)} />
      <StockReportView report={report} variant="public" />
      <Disclaimers context="report" />
    </>
  )
}
```

### Pattern 2: `generateMetadata` per page (canonical + OG + Twitter)

**What:** Per-route async metadata function that produces title, description, canonical URL, OG and Twitter cards from the materialised report.

**When to use:** Every dynamic public page.

**Example:**

```tsx
// app/stock/[ticker]/page.tsx (continued)
// Source: nextjs.org/docs/app/api-reference/functions/generate-metadata

import type { Metadata } from 'next'
import { buildCanonicalStockUrl } from '@/lib/seo/canonical'

export async function generateMetadata(
  { params }: { params: { ticker: string } }
): Promise<Metadata> {
  const ticker = params.ticker.toUpperCase()
  const report = await getStockReportFromMaterialisedStore(ticker, {
    cacheTags: [`stock:${ticker}`],
  })

  if (!report) {
    return {
      title: `${ticker} Stock Analysis | FinSight AI`,
      robots: { index: false, follow: true }, // stub pages: don't index
    }
  }

  const title = `${report.name} (${report.symbol}) Stock Analysis & FinSight Score | FinSight AI`
  const description = `${report.verdictLabel}. FinSight Score ${report.score}/10. ${report.oneLineSummary} (Analysis, not investment advice.)`

  return {
    title,
    description,
    alternates: {
      canonical: buildCanonicalStockUrl(report), // NSE-preferred when both listings exist
    },
    openGraph: {
      title,
      description,
      type: 'article',
      url: buildCanonicalStockUrl(report),
      siteName: 'FinSight AI',
      // OG image comes automatically from co-located opengraph-image.tsx — do not duplicate here
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: { index: true, follow: true },
  }
}
```

### Pattern 3: JSON-LD via typed builders

**What:** Build Schema.org JSON-LD objects with `schema-dts` type guards and emit them inline via a `<script type="application/ld+json">` tag in the RSC tree.

**When to use:** Every public page. Two blocks per page: entity (Corporation for stocks, FinancialProduct for funds) + Article for the analysis prose + a BreadcrumbList block.

**Example:**

```ts
// lib/seo/jsonld.ts
// Source: schema.org/Corporation, schema.org/Article, schema.org/BreadcrumbList
// Source: developers.google.com/search/docs/appearance/structured-data/breadcrumb

import type { Corporation, Article, BreadcrumbList, WithContext, FinancialProduct } from 'schema-dts'
import type { StockReport, FundReport } from '@finsight/shared'

const SITE = 'https://finsight.ai' // TODO: read from env

export function buildStockJsonLd(report: StockReport): [WithContext<Corporation>, WithContext<Article>] {
  // Corporation = the issuer entity (Schema.org has no dedicated "Stock" type)
  const corp: WithContext<Corporation> = {
    '@context': 'https://schema.org',
    '@type': 'Corporation',
    name: report.name,
    // tickerSymbol per schema.org docs: "exchange and instrument name separated by a space"
    tickerSymbol: `${report.exchange} ${report.symbol}`, // e.g. "NSE RELIANCE"
    url: `${SITE}/stock/${report.symbol}`,
  }

  // Article = the analysis itself; FinSight AI is the publisher/author
  const article: WithContext<Article> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${report.name} Stock Analysis & FinSight Score`,
    datePublished: report.computedAt,
    dateModified: report.computedAt,
    author: { '@type': 'Organization', name: 'FinSight AI' },
    publisher: { '@type': 'Organization', name: 'FinSight AI' },
    about: corp,
    // DO NOT add a Review or Rating block here — see Pitfall 6 below
  }

  return [corp, article]
}

export function buildFundJsonLd(report: FundReport): [WithContext<FinancialProduct>, WithContext<Article>] {
  // Schema.org has no MutualFund type; FinancialProduct is the parent.
  // InvestmentOrDeposit is a subtype but its properties don't fit MFs cleanly.
  const product: WithContext<FinancialProduct> = {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: report.schemeName,
    provider: { '@type': 'Organization', name: report.fundHouse },
    url: `${SITE}/fund/${report.schemeCode}`,
  }

  const article: WithContext<Article> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${report.schemeName} Mutual Fund Analysis & FinSight Fund Score`,
    datePublished: report.computedAt,
    dateModified: report.computedAt,
    author: { '@type': 'Organization', name: 'FinSight AI' },
    publisher: { '@type': 'Organization', name: 'FinSight AI' },
    about: product,
  }

  return [product, article]
}

export function buildBreadcrumbJsonLd(report: StockReport | FundReport): WithContext<BreadcrumbList> {
  const isStock = 'symbol' in report
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: isStock ? 'Stocks' : 'Mutual Funds', item: `${SITE}/${isStock ? 'stock' : 'fund'}` },
      {
        '@type': 'ListItem',
        position: 3,
        name: isStock ? report.name : report.schemeName,
        item: `${SITE}/${isStock ? `stock/${report.symbol}` : `fund/${report.schemeCode}`}`,
      },
    ],
  }
}
```

```tsx
// components/seo/json-ld.tsx
export function JsonLd({ data }: { data: object | object[] }) {
  // Emit inline so crawlers see it server-rendered.
  // Stringify with no extra whitespace; XSS-safe because we only pass typed objects we built ourselves.
  const json = Array.isArray(data) ? data.map((d) => JSON.stringify(d)).join('\n') : JSON.stringify(data)
  return (
    <script
      type="application/ld+json"
      // dangerouslySetInnerHTML is required for inline scripts in RSC and is safe here
      // because the input is built server-side from typed report data, not user content.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
```

### Pattern 4: NestJS-to-Next.js revalidate webhook (HMAC-signed)

**What:** When a BullMQ job in NestJS finishes recomputing a score/narrative, it POSTs to a Next.js Route Handler with an HMAC signature. The route verifies, then calls `revalidateTag(`stock:${ticker}`)`.

**When to use:** On every successful per-instrument recompute in `eod-recompute` and `narrative-batch` jobs.

**Example:**

```ts
// app/api/revalidate/route.ts
// Source: nextjs.org/docs/app/api-reference/functions/revalidateTag (single-arg form is the 15.5 signature)

import { revalidateTag } from 'next/cache'
import { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = process.env.REVALIDATE_WEBHOOK_SECRET! // loaded from env/secret manager

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('x-finsight-signature') ?? ''

  // HMAC-SHA256 in hex, constant-time comparison
  const expected = createHmac('sha256', SECRET).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const receivedBuf = Buffer.from(signatureHeader, 'hex')

  if (
    receivedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(receivedBuf, expectedBuf)
  ) {
    return Response.json({ error: 'invalid signature' }, { status: 401 })
  }

  const { tags } = JSON.parse(rawBody) as { tags: string[] }

  // Next 15.5: single-arg revalidateTag (16+ requires a profile arg)
  for (const tag of tags) {
    revalidateTag(tag)
  }

  return Response.json({ revalidated: true, tags, now: Date.now() })
}
```

```ts
// On the NestJS side (Phase 4 narrative-batch job extension):
// after writing a fresh report doc to Mongo, fire-and-forget:
//
//   const body = JSON.stringify({ tags: [`stock:${ticker}`] })
//   const sig = createHmac('sha256', secret).update(body).digest('hex')
//   await fetch(`${NEXT_PUBLIC_BASE_URL}/api/revalidate`, {
//     method: 'POST',
//     headers: { 'content-type': 'application/json', 'x-finsight-signature': sig },
//     body,
//   })
```

### Pattern 5: Dynamic `sitemap.ts` from instrument master

**What:** A `sitemap.ts` route that reads the instrument master (Phase 2) and emits one URL per stock and one per fund. For >50k URLs (likely with ~2000+ funds + ~5000 listed stocks if scope expands), use `generateSitemaps` to split.

**Example:**

```ts
// app/sitemap.ts
// Source: nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap

import type { MetadataRoute } from 'next'
import { listAllTickers, listAllSchemeCodes } from '@/lib/data/instrument-master'

const SITE = 'https://finsight.ai'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tickers, schemes] = await Promise.all([listAllTickers(), listAllSchemeCodes()])

  const stocks: MetadataRoute.Sitemap = tickers.map((t) => ({
    url: `${SITE}/stock/${t.symbol}`,
    lastModified: t.lastReportComputedAt ?? new Date(),
    changeFrequency: 'daily',
    priority: 0.8,
  }))

  const funds: MetadataRoute.Sitemap = schemes.map((s) => ({
    url: `${SITE}/fund/${s.schemeCode}`,
    lastModified: s.lastReportComputedAt ?? new Date(),
    changeFrequency: 'daily',
    priority: 0.7,
  }))

  return [
    { url: SITE, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    ...stocks,
    ...funds,
  ]
}
```

```ts
// app/robots.ts
// Source: nextjs.org/docs/app/api-reference/file-conventions/metadata/robots

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Allow public report pages and root; block app/auth/internal API surfaces
      { userAgent: '*', allow: ['/', '/stock/', '/fund/'], disallow: ['/api/', '/app/', '/auth/'] },
    ],
    sitemap: 'https://finsight.ai/sitemap.xml',
    host: 'https://finsight.ai',
  }
}
```

### Anti-Patterns to Avoid

- **Client-rendered report content.** A `'use client'` component that `fetch`es the report in `useEffect` produces an empty shell in view-source. Crawlers see nothing. The entire phase fails.
- **`dynamic = 'force-dynamic'` on the page.** Bypasses both SSG and ISR; every crawler hit re-renders + re-fetches Mongo. Use the default (`'auto'`) plus `export const revalidate`.
- **Importing `@google/genai` anywhere under `app/stock/**` or `app/fund/**`.** Even an unused import via a tooltip component pulls Gemini into the render path. Enforce with ESLint `no-restricted-imports` and a CI grep.
- **Adding `Review` / `Rating` JSON-LD blocks for the FinSight Score.** Google doesn't honour it for financial products (no rich result) AND it crosses the SEBI line from "analysis" toward "recommendation."
- **One sitemap with 100k URLs.** Google's per-sitemap cap is 50k; use `generateSitemaps` when the universe exceeds that.
- **Query-string-secret webhook auth (`?secret=...`).** Logs/CDNs leak secrets in query strings. Use a signature header with HMAC + `timingSafeEqual`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Static pre-render for top tickers | Custom build script generating HTML files | Next.js `generateStaticParams` | Built into the framework, gets ISR + cache headers + Vercel/Cloudflare integration for free. |
| Cache invalidation when scores change | TTL-only with short revalidate (e.g. 60s) | `revalidateTag` from the NestJS job | TTL-only causes stale content for the whole window OR thunders the origin with re-renders. Tag invalidation is precise. |
| Per-route OG image rendering | Custom Puppeteer/Playwright pipeline | `opengraph-image.tsx` + `next/og` `ImageResponse` (Satori) | Edge-runtime, no headless-Chrome footprint, statically optimised when `params` are pre-rendered. [CITED: nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image] |
| Sitemap generation | Custom XML writer | `app/sitemap.ts` returning `MetadataRoute.Sitemap` | Framework handles XML formatting, content-type, caching. `generateSitemaps` handles the 50k-URL split. |
| robots.txt | Static file | `app/robots.ts` returning `MetadataRoute.Robots` | Same as sitemap — typed, generated, cached. |
| JSON-LD authoring | Hand-written object literals | `schema-dts` types + `<script type="application/ld+json">` | Compile-time validation of property names and required fields. |
| Webhook signature | Plain shared-secret comparison with `===` | `crypto.timingSafeEqual` on HMAC SHA-256 | `===` is timing-attackable. HMAC+constant-time is the standard pattern. |
| Lighthouse Core Web Vitals gating | Manual review pre-deploy | `@lhci/cli` in CI | Per-PR perf regression detection without human attention. |

**Key insight:** Public SEO pages are 95% framework features you wire together correctly and 5% original code (the JSON-LD builders + the webhook handler). The "build" of this phase is mostly composition.

## Common Pitfalls

### Pitfall 1: Empty-shell HTML — page renders client-side, crawler sees nothing

**What goes wrong:** A component in the report tree is marked `'use client'` and `fetch`es the data in `useEffect`. View-source shows the layout shell with no report content. Google indexes the empty page.

**Why it happens:** Mixing the auth-gated app version of the report (which is client-fetched after JWT check) with the public version. The boundary is subtle in App Router.

**How to avoid:**
- The `page.tsx` itself is a Server Component (no `'use client'` at the top).
- All data fetching happens inside the RSC `page.tsx` and the JSX renders synchronously.
- Interactive bits (chart pan/zoom, peer toggle) are isolated leaf Client Components that receive serialised data as props.
- **Verification:** `curl -s https://finsight.ai/stock/RELIANCE | grep -q "FinSight Score"` MUST pass before the page ships.

**Warning signs:** Lighthouse SEO score < 90 on a stock page; "Document does not have a meta description" or "Links do not have descriptive text" warnings; view-source shows only `<div id="__next">` and scripts.

### Pitfall 2: Live Gemini accidentally triggered by a Suspense boundary / tooltip / lazy import

**What goes wrong:** The Phase 4 report renderer imports an `<AskFinSightTeaser />` button (or a "regenerate summary" tooltip, or a debug panel). The button's component file imports `@google/genai`. Even if the button never calls Gemini, the import pulls the SDK into the public page's server bundle — and a stray code path can call it on render. Latency spikes; cost scales with page views; the materialised-read invariant breaks silently.

**Why it happens:** Component reuse across the auth-gated app and the public page brings hidden dependencies along. The "public" report variant is a subset of the app variant; assumptions about what's "safe" leak.

**How to avoid:**
- **ESLint boundary:** add `no-restricted-imports` config that forbids `@google/genai` (and the NestJS Gemini facade) under `app/stock/**` and `app/fund/**`. Build fails at CI.
- **CI grep:** `git grep -E "@google/genai|gemini" apps/web/src/app/stock apps/web/src/app/fund` MUST return zero matches.
- **Runtime assertion:** in a Vitest integration test, mock the Gemini client (`vi.mock('@google/genai')`) with a throwing constructor, render the page, assert it does not throw and the mock is never called.
- A separate `<PublicStockReportView>` component (no Ask FinSight, no regenerate button, no admin tooltips) is safer than reusing `<StockReportView>` with feature flags.

**Warning signs:** p95 page latency creeps above 500ms; Gemini billing line item correlated with page-view spikes; bundle analyser shows `@google/genai` in the stock route's server chunk.

### Pitfall 3: Stale ISR — score changed but page still serves yesterday's number

**What goes wrong:** EOD recompute finishes at 22:00 IST and writes a new score to Mongo. The ISR page still has yesterday's score cached until the next request after `revalidate` expires (up to 24h later). Google indexes stale scores.

**Why it happens:** Time-based ISR is *passive* — it doesn't push, it waits for a request after the window. Pure `revalidate = 86400` without tag invalidation gives up to 24h of stale.

**How to avoid:**
- Tag every fetch with `[`stock:${ticker}`, 'stock-report']`.
- The EOD `narrative-batch` job, after writing each fresh report doc, POSTs to `/api/revalidate` with `tags: [`stock:${ticker}`]`.
- Use `revalidate = 86400` as the safety floor (in case the webhook fails) — defence in depth.

**Warning signs:** Manual `curl` after a known recompute shows the old score; logs show no recent POSTs to `/api/revalidate`; webhook 401s in NestJS logs.

### Pitfall 4: Duplicate-content NSE vs BSE — two URLs for the same company

**What goes wrong:** `RELIANCE.NS` and `500325.BO` are the same company. If the instrument master spawns both `/stock/RELIANCE` and `/stock/500325`, Google sees duplicate content and may de-rank both.

**Why it happens:** Indian listing duality is not a thing on most stock data platforms; devs unfamiliar with Indian market assume one symbol per company.

**How to avoid:**
- The canonical URL builder always prefers the NSE variant when both listings exist on the same instrument-master row.
- `generateStaticParams` only emits the NSE symbol; the BSE numeric code is mapped server-side via the instrument master.
- If a user lands on `/stock/500325`, `generateMetadata` emits `<link rel="canonical" href="/stock/RELIANCE">` and the page renders the same content. Optionally 301-redirect for clarity.

**Warning signs:** Search Console reports "Duplicate without user-selected canonical"; both URLs appear in `site:finsight.ai` results.

### Pitfall 5: Missing compliance disclaimer on the public-rendered HTML

**What goes wrong:** The disclaimer component is wrapped in a Client Component or a Suspense fallback that crawlers don't see. The HTML shipped to Googlebot omits "Analysis, not advice" / "Past performance is not indicative of future returns." This breaks the COMP-03 contract on a publicly indexed surface.

**Why it happens:** Treating disclaimers as visual chrome instead of regulatory content.

**How to avoid:**
- `<Disclaimers />` is a pure Server Component rendering plain text inside `<p>` or `<aside>` tags directly in the page tree.
- `view-source` MUST contain the disclaimer text verbatim — add this to the CI smoke test.
- The disclaimer strings live in `lib/seo/disclaimers.ts` as a single source of truth (referenced from Phase 1's COMP-03 implementation).

**Warning signs:** A Lighthouse SEO audit doesn't catch this — write a custom CI assertion: `curl ... | grep -q "Analysis, not investment advice"`.

### Pitfall 6: `Review`/`Rating` JSON-LD on a financial product

**What goes wrong:** Marking the FinSight Score as `Rating` (1–10) inside a `Review` block, hoping for star-rating rich snippets on Google.

**Why it happens:** Star ratings are seductive for click-through-rate; the docs *seem* to support it for "Product"; "FinancialProduct" is a Product subtype, so the assumption transfers.

**How to avoid:**
- Google's structured-data review-snippet documentation enumerates supported types (Book, Course, Event, LocalBusiness, Movie, Product, Recipe, Software App, etc.) — **financial products are NOT listed** [CITED: developers.google.com/search/docs/appearance/structured-data/review-snippet]. Markup won't render as a rich result.
- Worse, a machine-readable `Rating` on a stock + an `author: FinSight AI` is precisely the AI-driven analytical tooling SEBI's Dec 2024 amendments brought under RA oversight (cf. PITFALLS.md Pitfall 1). It edges from "analysis" toward "recommendation."
- **Use `Corporation` (stocks) / `FinancialProduct` (funds) + `Article` for the analysis prose.** No `Review`, no `Rating`. Internal score is rendered as plain text/visual, not as machine-readable structured data.

**Warning signs:** Lead engineer proposes "let's add aggregateRating for SEO"; PR adds `'@type': 'Rating'` anywhere; SEO contractor recommends it.

### Pitfall 7: Webhook auth via plain shared-secret comparison

**What goes wrong:** `if (request.headers.get('x-secret') === SECRET) { revalidate() }`. Vulnerable to timing attacks; secret in `?secret=...` query strings leaks via logs/CDNs.

**How to avoid:** HMAC SHA-256 over the raw body, sent in `x-finsight-signature` header, compared with `crypto.timingSafeEqual` on equal-length buffers (see Pattern 4 code).

**Warning signs:** Secret literal appears in URL paths in nginx/Vercel logs; `=== SECRET` comparison in `/api/revalidate`.

### Pitfall 8: "We're building the report" stub page indexed

**What goes wrong:** Long-tail ticker `/stock/ZZZUNKNOWN` triggers on-demand ISR. No report exists in Mongo. Stub page renders, gets cached for 24h, and gets indexed by Google as the page for that ticker.

**How to avoid:**
- Stub page returns `robots: { index: false, follow: true }` from `generateMetadata`.
- Stub page enqueues a one-off compute job (fire-and-forget) so the next crawl returns the real report.
- After the real report is computed, the narrative-batch job calls `revalidateTag` to drop the stub from cache.

**Warning signs:** Google index shows pages with "We're building the report" text.

## Runtime State Inventory

> Greenfield phase — no rename/refactor/migration. **OMITTED.**

## Code Examples

Verified patterns from official Next.js 15 / Schema.org sources. See Pattern 1–5 above for full inline examples. Quick references:

### `view-source` smoke test (proves SSR)

```bash
# Local dev (after `pnpm dev`)
curl -s http://localhost:3000/stock/RELIANCE | grep -E "(FinSight Score|application/ld\+json|rel=\"canonical\"|Analysis, not investment advice)"
# Each line must match — that's 4 OR conditions, all required to pass.
```

### Integration test that no Gemini call happens

```ts
// apps/web/__tests__/stock-page.no-gemini.test.tsx
// Source: project Vitest config (Phase 1)
import { describe, it, expect, vi } from 'vitest'

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => {
    throw new Error('Gemini must not be instantiated in public page render')
  }),
}))

describe('GET /stock/[ticker]', () => {
  it('does not import or call Gemini', async () => {
    const StockPage = (await import('@/app/stock/[ticker]/page')).default
    // params is sync in Next 15.5
    const result = await StockPage({ params: { ticker: 'RELIANCE' } })
    expect(result).toBeDefined()
    // If the mock had been called/instantiated, it would have thrown above
  })
})
```

### Static analysis ban for Gemini imports under public routes

```jsonc
// apps/web/eslint.config.mjs (excerpt)
{
  files: ['src/app/stock/**', 'src/app/fund/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@google/genai', '**/ai/gemini*'], message: 'No live Gemini on public pages. Read from materialised store only.' },
      ],
    }],
  },
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getStaticPaths` + `getStaticProps` (Pages Router) | `generateStaticParams` + RSC in App Router | Next.js 13 (2023) | Pages Router still works but is legacy; App Router is the documented path for new builds. [CITED: nextjs.org/docs/app] |
| `fetch(url, { next: { revalidate: N }})` + manual revalidate API endpoint | `revalidateTag` from any Server Action / Route Handler with `cacheTag` annotations | Next.js 14 stabilised; 15.5 current | Tag-based gives precise per-resource invalidation instead of path-based. |
| `pages/_document.tsx` for `<Head>` SEO | `generateMetadata` + Metadata API (`Metadata` type) | Next.js 13.3 | Typed, async, per-route. |
| Manual sitemap.xml generation script | `app/sitemap.ts` + `generateSitemaps` | Next.js 13.3 + 13.4 | Framework-native; auto cache + content-type. |
| Single-arg `revalidateTag(tag)` | Two-arg `revalidateTag(tag, profile)` with stale-while-revalidate semantics | Next.js 16.0 | **15.5 still uses single-arg.** Plan upgrade if/when project moves to 16. |
| Sync `params` in dynamic routes | Async `params: Promise<...>` | Next.js 16.0 | **15.5 still uses sync.** Plan upgrade with `await params` migration. |

**Deprecated/outdated:**
- AMP (Accelerated Mobile Pages) — Google deprioritised in 2021; don't ship.
- `getServerSideProps` for SEO pages — works but loses SSG/ISR benefits.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (≥ 18.18 for Next 15) | Next.js build + runtime | TBD by user | TBD | — |
| Next.js host with on-demand ISR support | `revalidate` + `revalidateTag` | TBD (Vercel ✓; self-host ✓ via `next start`) | Next 15.5 | If host is static-only (e.g. S3 + CloudFront pure), fall back to time-based `revalidate` only and accept up to 24h stale. |
| Mongo client + Redis client in `apps/web` server runtime | Materialised report reads | Should exist from Phase 4 | — | — |
| Outbound HTTP from NestJS to Next.js (for revalidate webhook) | `revalidateTag` triggers | Required | — | If blocked by network: poll-based invalidation from Next.js cron — slower, hacky. Open the path. |
| Lighthouse Chrome runner (CI) | `@lhci/cli` perf gating | Should exist on most CI providers (GitHub Actions runners include Chrome) | — | Skip perf gate; manual review per PR. |
| Public DNS + HTTPS termination | Production SEO pages | TBD (deploy concern, not code) | — | — |

**Missing dependencies with no fallback:**
- None block code completion of the phase. Host capability matters at deploy time.

**Missing dependencies with fallback:**
- If the chosen host doesn't support on-demand ISR + `revalidateTag` (rare for Vercel/Netlify/self-hosted `next start`, real risk for static-export hosts like S3+CloudFront), fall back to pure time-based ISR with shorter `revalidate` (e.g. 3600s) and accept some stale window.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (Next.js side per STACK.md) — verify v1+ in repo; install if missing (Wave 0) |
| Config file | `apps/web/vitest.config.ts` — verify exists |
| Quick run command | `pnpm --filter @finsight/web test -- --run` |
| Full suite command | `pnpm --filter @finsight/web test -- --run --coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEO-01 | `/stock/[ticker]` renders full HTML server-side | smoke (curl + grep) | `pnpm dev & sleep 5 && curl -s http://localhost:3000/stock/RELIANCE \| grep -q "FinSight Score"` | ❌ Wave 0 |
| SEO-01 | Top-N tickers pre-rendered at build | build assertion | `pnpm --filter @finsight/web build 2>&1 \| grep -c "○ /stock/"` ≥ 500 | ❌ Wave 0 |
| SEO-02 | `/fund/[schemeCode]` renders full HTML server-side | smoke | `curl -s http://localhost:3000/fund/120503 \| grep -q "Fund Score"` | ❌ Wave 0 |
| SEO-03a | JSON-LD `Corporation` block present and well-formed | integration | `pytest`-equivalent: parse `<script type="application/ld+json">` from rendered HTML, assert `@type === 'Corporation'` and `tickerSymbol` set | ❌ Wave 0 |
| SEO-03b | Canonical `<link rel="canonical">` present and NSE-preferred | integration | parse `<link rel="canonical">` from rendered HTML, assert it matches the NSE URL even when route is the BSE code | ❌ Wave 0 |
| SEO-03c | OG and Twitter meta tags present | integration | parse `<meta property="og:title">`, `<meta name="twitter:card">` from rendered HTML | ❌ Wave 0 |
| SEO-04a | No Gemini client instantiated during page render | unit | `vi.mock('@google/genai')` with throwing constructor; render page; assert no throw and zero calls | ❌ Wave 0 |
| SEO-04a | Static ban: no `@google/genai` import under `app/stock/**` or `app/fund/**` | CI grep | `! git grep -E "@google/genai\|gemini" apps/web/src/app/stock apps/web/src/app/fund` | ❌ Wave 0 |
| SEO-04a | ESLint `no-restricted-imports` rule active | lint | `pnpm --filter @finsight/web lint` (rule enforced by config) | ❌ Wave 0 (eslint config edit) |
| SEO-04b | Compliance disclaimers in rendered HTML | smoke | `curl -s ... \| grep -q "Analysis, not investment advice"` and `grep -q "Past performance"` | ❌ Wave 0 |
| SEO-04 / Perf | Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms | E2E perf | Lighthouse CI: `lhci autorun --collect.url=http://localhost:3000/stock/RELIANCE --assert.preset=lighthouse:recommended` | ❌ Wave 0 (lhci config) |
| Invalidation | `revalidateTag` webhook flow end-to-end | integration | (manual or CI) POST signed payload to `/api/revalidate` → assert next request to `/stock/X` serves updated content | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @finsight/web test -- --run` (Vitest quick) + `pnpm --filter @finsight/web lint`
- **Per wave merge:** Full Vitest suite + `pnpm --filter @finsight/web build` + curl smoke against the built output (`next start` in background)
- **Phase gate:** Lighthouse CI green on at least one stock and one fund URL; CI grep guards green; integration test suite green

### Wave 0 Gaps
- [ ] `apps/web/vitest.config.ts` — verify it exists from Phase 1; install Vitest if not
- [ ] `apps/web/__tests__/stock-page.no-gemini.test.tsx` — covers SEO-04a (Gemini ban)
- [ ] `apps/web/__tests__/stock-page.ssr.test.tsx` — covers SEO-01 (curl-equivalent rendered-HTML assertion via Next.js test utils)
- [ ] `apps/web/__tests__/seo/jsonld.test.ts` — covers SEO-03a (Corporation block well-formed)
- [ ] `apps/web/__tests__/seo/canonical.test.ts` — covers SEO-03b (NSE preference)
- [ ] `apps/web/__tests__/api/revalidate.route.test.ts` — covers webhook HMAC + revalidateTag call
- [ ] `apps/web/eslint.config.mjs` — add `no-restricted-imports` rule for `app/stock/**` and `app/fund/**`
- [ ] `lighthouserc.json` (or `lhci` config) — perf assertions
- [ ] CI script step: `git grep -E "@google/genai|gemini" apps/web/src/app/stock apps/web/src/app/fund` MUST exit nonzero (zero matches)
- [ ] Local: a fixture instrument master with at least 1 NSE-only ticker, 1 NSE+BSE dual-listed ticker, 1 long-tail unknown ticker, and 1 fund scheme code, so all four code paths are exercised in tests

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Public page; no auth on `/stock/*` or `/fund/*`. Auth middleware MUST NOT cover these paths. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | partial | `/api/revalidate` is the only protected surface — HMAC-signed webhook from NestJS. |
| V5 Input Validation | yes | `[ticker]` and `[schemeCode]` params validated (uppercase, regex-restricted, length-bounded) before any DB lookup to prevent NoSQL-injection-style probing of the instrument master. |
| V6 Cryptography | yes | HMAC SHA-256 for webhook signing; `crypto.timingSafeEqual` for comparison. Never roll a custom comparator. |
| V7 Error Handling | yes | Never leak stack traces from `/api/revalidate`; the route handler returns `{ error: 'invalid signature' }` only — no diagnostic detail. |
| V14 Configuration | yes | `REVALIDATE_WEBHOOK_SECRET` from env/secret manager — never hardcoded; never `NEXT_PUBLIC_*`. CLAUDE.md `no-hardcoded-secrets` rule applies. |

### Known Threat Patterns for Next.js public SEO pages + NestJS webhook

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated revalidation flood (cache thrashing) | Denial of Service | HMAC-signed webhook + rate-limit on the revalidate Route Handler (e.g. 100/min from known NestJS IP, via Vercel/CDN rule or in-handler) |
| Webhook secret exposed in query string / logs | Information Disclosure | Signature in header, not query string; redact in logs; rotate on suspicion |
| Timing-attack secret comparison | Information Disclosure | `crypto.timingSafeEqual` on equal-length buffers (see Pattern 4) |
| Param injection (e.g. `[ticker] = "../../../etc"`) | Tampering | Strict regex validation on `ticker` (`/^[A-Z0-9-]{1,15}$/`) and `schemeCode` (`/^[0-9]{1,7}$/`) before any DB lookup |
| SEO content injection via Mongo (stored compliance violation) | Tampering / Compliance | Phase 4 compliance interceptor sanitises at write time; this phase READS — so the guarantee is inherited, not enforced again. Verify via integration test that pulls a known sanitised doc. |
| Crawler-induced cache poisoning (long-tail stub indexed) | Reputation / Compliance | Stub pages set `robots: { index: false }`; revalidate-on-compute clears the stub from cache |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | NIFTY 500 stocks (≈500) + top ~2000 funds is the right "top-N" cohort for build-time SSG | Pattern 1, Standard Stack | Wrong N: too small → poor SEO coverage at launch; too large → build time bloats. Calibrate in Phase 8 planning against measured build duration. [ASSUMED] |
| A2 | EOD recompute job cadence matches `revalidate = 86400` (24h) | Pattern 1 | If EOD runs more often than daily, the safety floor is too long and 8 doesn't matter much; if it runs less, the floor is too short and we re-render stale content. Confirm from Phase 3. [ASSUMED] |
| A3 | The materialised report DTO from Phase 4 includes `computedAt`, `exchange`, `verdictLabel`, `oneLineSummary`, `symbol`, `name`, `score` fields | Patterns 1, 2, 3 | Missing field → JSON-LD or metadata fields can't be populated; planner adds DTO fields to Phase 4 or this phase. [ASSUMED] |
| A4 | Public stock URL pattern is `/stock/[ticker]` with the NSE symbol (e.g. `RELIANCE`) as the canonical | All patterns | Confirmed by orchestrator's locked decisions; low risk. [VERIFIED: orchestrator prompt] |
| A5 | The `apps/web` runtime can reach Mongo + Redis directly (not only via NestJS HTTP) | Pattern 1 | If `apps/web` cannot read Mongo directly, swap `getStockReportFromMaterialisedStore` to call a NestJS internal endpoint with a service-to-service token. Either works; the choice affects code. [ASSUMED] |
| A6 | Vercel-style on-demand ISR is the deploy target | Environment Availability | If self-hosting on a static-only platform, `revalidateTag` doesn't work; phase needs a different invalidation strategy. Confirm hosting before planning. [ASSUMED] |
| A7 | Lighthouse CI runs in CI; Chrome available on runner | Validation | If CI is bare-bones, install Chrome or use a Docker image with it. [ASSUMED] |
| A8 | NSE is the canonical exchange when a stock is dual-listed on NSE+BSE | Pitfall 4 | Confirmed by orchestrator's locked decisions. [VERIFIED: orchestrator prompt] |

**Risk-weighted shortlist to confirm before Phase 8 planning:**
- A1, A2, A3 — affect implementation scope and DTO contract.
- A5, A6 — affect architecture; lock these before planning.

## Open Questions

1. **Where does `apps/web` get the report data from — directly from Mongo, or via a NestJS internal HTTP call?**
   - What we know: Phase 4 builds `GET /reports/stock/:ticker` in NestJS; STACK.md positions `apps/web` as a Next.js frontend that calls the NestJS API; but for SSR perf, a direct Mongo read inside Next.js is faster.
   - What's unclear: which the team prefers. Direct DB access in Next.js means two clients to manage; API access adds an internal hop but keeps DB access in one place.
   - Recommendation: **Internal NestJS HTTP call** (one Mongo client, one source of truth, easier to mock in tests, internal latency negligible). Confirm during planning.

2. **What is the "graceful stub" UX for long-tail tickers with no report yet?**
   - What we know: Pitfall 8 requires `robots: { index: false }` on the stub.
   - What's unclear: visual / copy. Probably: "We're computing analysis for {ticker} — refresh in a minute" + a CTA to a search/landing for similar stocks.
   - Recommendation: design pass during Phase 8 UI tasks; one-shot stub component.

3. **Should peer-comparison internal links open the peer page in same tab (SEO authority flow) or new tab (UX)?**
   - What we know: focus_area F mentions internal linking as SEO signal; default `<a target="_blank">` doesn't break SEO but weakens flow signal.
   - Recommendation: same tab (no `target`), standard hyperlink. Internal links should look like internal links to crawlers.

4. **OG image: dynamic per-ticker at build time, or static brand fallback only?**
   - What we know: `opengraph-image.tsx` co-located with the route auto-generates per ticker; statically optimised when `params` comes from `generateStaticParams`.
   - Recommendation: dynamic per-ticker for top-N (build cost is acceptable); long tail falls back to a single brand OG image (the parent route's `opengraph-image.png`). Cleanest UX without exploding build.

## Sources

### Primary (HIGH confidence)
- nextjs.org/docs/app/api-reference/functions/generate-static-params — `generateStaticParams`, `dynamicParams`, ISR semantics (fetched 2026-05-28)
- nextjs.org/docs/app/api-reference/functions/revalidateTag — `revalidateTag` signatures, 15.5 vs 16 API drift documented (fetched 2026-05-28)
- nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap — `sitemap.ts` convention, `generateSitemaps` for 50k+ URL split (fetched 2026-05-28)
- nextjs.org/docs/app/api-reference/file-conventions/metadata/robots — `robots.ts` convention (fetched 2026-05-28)
- nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image — `opengraph-image.tsx`, `ImageResponse` from `next/og` (fetched 2026-05-28)
- developers.google.com/search/docs/appearance/structured-data/review-snippet — review-snippet eligibility list (financial products NOT listed) (fetched 2026-05-28)
- schema.org/Corporation — `tickerSymbol` property (exchange + instrument, space-separated) (fetched 2026-05-28)
- schema.org/FinancialProduct — hierarchy, subtypes, properties (fetched 2026-05-28)
- `.planning/research/SUMMARY.md`, `STACK.md`, `PITFALLS.md`, `.planning/PROJECT.md` — locked stack + invariants + compliance/pitfalls grounding

### Secondary (MEDIUM confidence)
- npm registry — `schema-dts@1.1.5`, `@lhci/cli@0.15.x` (live query 2026-05-28)
- GoogleChrome/lighthouse-ci GitHub README — `@lhci/cli` usage

### Tertiary (LOW confidence)
- None — every prescriptive claim in this research has a primary or secondary source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Next.js APIs verified against official docs; versions verified against npm; one cross-version caveat (15.5 vs 16 `revalidateTag` signature) called out explicitly.
- Architecture: HIGH — all patterns are direct framework features, none speculative.
- Pitfalls: HIGH — Pitfalls 1, 6, 7 verified against Google + Next.js + Node crypto docs; Pitfalls 2, 3, 4, 5, 8 are direct corollaries of the locked invariants in SUMMARY.md/PITFALLS.md/PROJECT.md.
- JSON-LD recommendation: HIGH — Google's official review-snippet doc was consulted; the "don't use Review/Rating" finding is primary-sourced.

**Research date:** 2026-05-28
**Valid until:** 2026-06-27 (30 days — Next.js APIs are stable on the 15.5 line; re-verify if upgrading to 16)
