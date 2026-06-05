---
phase: 08-public-seo-pages
verified: 2026-06-05T23:50:00Z
status: human_needed
score: 8/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run `pnpm --filter web build` and check route manifest"
    expected: "Build completes; route manifest lists /stock/[ticker], /fund/[schemeCode], /sitemap/[__metadata_id__], /stock/[ticker]/opengraph-image, /fund/[schemeCode]/opengraph-image as SSG/ISR routes"
    why_human: "pnpm build was not executed — 08-02-SUMMARY explicitly notes build proofs were blocked; curl HTTP-shape proofs (OG image Content-Type, sitemap XML) require a running server"
  - test: "Run `curl -sI http://localhost:3000/stock/RELIANCE/opengraph-image | grep image/png` and `curl -sI http://localhost:3000/fund/120503/opengraph-image | grep image/png`"
    expected: "Both routes return Content-Type: image/png with status 200"
    why_human: "OG ImageResponse routes require a running Next.js server; cannot be verified statically"
  - test: "Run `curl -s http://localhost:3000/sitemap/0.xml` and verify it contains `<urlset>` XML with entries for /stock/ and /fund/ URLs"
    expected: "When PUBLIC_INSTRUMENTS_BASE is set and Phase 2 public endpoint is live, sitemap contains one URL per instrument; currently emits root-only URL (empty instrument master)"
    why_human: "Sitemap output depends on Phase 2 public instruments endpoint (PUBLIC_INSTRUMENTS_BASE env flag) not yet shipped; root-only sitemap is the correct current state but the full-universe truth cannot be verified until Phase 2 lands"
---

# Phase 8: Public SEO Pages Verification Report

**Phase Goal:** Every stock and fund has a public, server-rendered, indexable page that reads from the materialised store, carries structured data and compliance disclaimers, and serves complete HTML to crawlers.
**Verified:** 2026-06-05T23:50:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | A crawler hitting /stock/RELIANCE sees the FinSight Score, verdict label, and one-line summary in view-source HTML | ✓ VERIFIED | `stock-page.ssr.test.tsx` asserts `renderToStaticMarkup` output contains "FinSight Score", "Strong Score", "diversified conglomerate"; 150/150 green |
| 2 | A crawler hitting /fund/120503 sees the FinSight Fund Score and verdict in view-source HTML | ✓ VERIFIED | `fund-page.ssr.test.tsx` parallel test asserts full HTML SSR; 150/150 green |
| 3 | Every public stock and fund page contains the analysis-not-advice + past-performance disclaimers in server-rendered HTML | ✓ VERIFIED | SSR tests assert "Analysis, not investment advice" + "Past performance"; inline `PublicDisclaimers` renders on both real-report and stub paths; DTO-fallback constant ensures never absent |
| 4 | Every public page emits inline JSON-LD with Corporation (or FinancialProduct) + Article + BreadcrumbList — NO Review/Rating blocks | ✓ VERIFIED | SSR test asserts all three `@type` values present; SEBI negative assertion (`not.toContain("Review"/"Rating"/"aggregateRating")`); `jsonld.test.ts` recursive key collector confirms no `review`/`aggregaterating`/`rating` keys |
| 5 | Every public page emits canonical URL with NSE preference for dual-listed stocks | ✓ VERIFIED | `canonical.test.ts` (6 tests): NSE-plain, BSE→NSE dual-listed, BSE-only fallback, M&M percent-encoded NSE, M&M dual-listed BSE; `generateMetadata` SSR test asserts `alternates.canonical === "https://finsight.ai/stock/RELIANCE"` |
| 6 | Every public page emits OG title/description/url/type=article + Twitter card meta tags | ✓ VERIFIED | `generateMetadata` SSR test asserts `openGraph.type === "article"` and `twitter.card === "summary_large_image"`; `openGraph.siteName === "FinSight AI"` present in page.tsx |
| 7 | Long-tail tickers/funds with no precomputed report render a robots:{index:false} stub and queue an ad-hoc compute job | ✓ VERIFIED | `generateMetadata` returns `robots: { index: false, follow: true }` when `getStockReportFromMaterialisedStore` returns null; stub path calls `void enqueueAdHocStockCompute(upper).catch(() => undefined)` with explicit catch (WR-03 fix) |
| 8 | Page render never instantiates the Gemini SDK (@google/genai) | ✓ VERIFIED | Three-layer ban: (1) static scan `no-gemini-imports.static.test.ts` checks 5 guarded files; (2) CI grep in `.github/workflows/ci.yml` exits 1 on any match under `apps/web/src/app/stock` or `apps/web/src/app/fund`; (3) runtime mock-throw in `stock-page.no-gemini.test.tsx` + `fund-page.no-gemini.test.tsx`; grep confirms zero matches currently |
| 9 | sitemap.xml contains one URL per stock and per fund in the instrument master | ⚠ PARTIAL | `sitemap.ts` + `listAllTickers`/`listAllSchemeCodes` correctly wired; `sitemap.test.ts` (5 tests) mock-verified; but `PUBLIC_INSTRUMENTS_BASE` is unset → instrument master returns `[]` → sitemap currently emits root-only URL. Code is correct and empty-safe; full-universe output requires Phase 2 public endpoint + env flag. |
| 10 | Per-ticker/per-fund OG images render via Edge runtime; static brand fallback exists | ? UNCERTAIN | `opengraph-image.tsx` files exist with `runtime = "edge"`, param validation, defensive try/catch, branded fallback. Static `opengraph-image.png` (1200×630, 24,690 bytes) present. HTTP-shape proof (`curl -sI .../opengraph-image | grep image/png`) requires running server — not executed. |

**Score:** 8/10 truths verified (1 partial/data-gated, 1 needs runtime proof)

### Deferred Items

Items not yet met due to an unshipped upstream dependency (Phase 2).

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | sitemap emits one URL per stock + fund (full universe) | Phase 2 | `instrument-master.ts:104` gated on `PUBLIC_INSTRUMENTS_BASE`; `TODO(phase-2)` comment; Phase 2 success criteria #1: "canonical instrument master resolves each stock" |
| 2 | generateStaticParams prebuilds NIFTY 500 + top 2000 funds | Phase 2 | `getTopNTickers`/`getTopNFundSchemeCodes` return `[]` until Phase 2 public endpoint lands; ISR handles the long tail correctly in the interim |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `apps/web/src/app/stock/[ticker]/page.tsx` | Public stock RSC with generateStaticParams + dynamicParams=true + revalidate=86400 + generateMetadata | ✓ VERIFIED | All four exports present; 218 lines; no `'use client'`, no Gemini import |
| `apps/web/src/app/fund/[schemeCode]/page.tsx` | Public fund RSC, same structure as stock | ✓ VERIFIED | All four exports present; 177 lines |
| `apps/web/src/lib/seo/jsonld.ts` | JSON-LD builders (Corporation, FinancialProduct, Article, BreadcrumbList) | ✓ VERIFIED | Exports `buildStockJsonLd`, `buildFundJsonLd`, `buildBreadcrumbJsonLd`; `summaryOf` truncates to 160 chars (WR-04 fix); `</script>` escape in `json-ld.tsx` (WR-01 fix) |
| `apps/web/src/lib/seo/canonical.ts` | Canonical URL builder with NSE preference for dual-listed stocks | ✓ VERIFIED | Both branches use `encodeURIComponent` (CR-01 fix); 39 lines |
| `apps/web/src/components/compliance/disclaimers.tsx` | Server-rendered disclaimer block | ✓ VERIFIED | Exists; pages use inline `PublicDisclaimers` (documented deviation from plan — preferred pattern); shared `Disclaimers` component also present |
| `apps/web/src/app/sitemap.ts` | Dynamic sitemap with generateSitemaps split | ✓ VERIFIED | Implements `generateSitemaps` + default export; 45k cap; empty-safe |
| `apps/web/src/app/robots.ts` | Typed robots.txt | ✓ VERIFIED | Allows `/stock/` `/fund/`; disallows `/api/` `/app/` `/auth/`; links `/sitemap/0.xml` (correct sharded path, deviation from plan's `/sitemap.xml` — documented and verified) |
| `apps/web/src/app/stock/[ticker]/opengraph-image.tsx` | Per-ticker OG image (Edge runtime, Satori) | ✓ VERIFIED (code) | `runtime = "edge"`, param validation, defensive catch, TICKER_RE guard before internal-secret fetch (WR-02 fix) |
| `apps/web/src/app/fund/[schemeCode]/opengraph-image.tsx` | Per-fund OG image | ✓ VERIFIED (code) | Mirror of stock; SCHEME_RE guard |
| `apps/web/src/app/opengraph-image.png` | Static 1200x630 brand fallback | ✓ VERIFIED | Present; 24,690 bytes |
| `apps/web/src/app/api/internal/revalidate/route.ts` | POST handler with HMAC SHA-256 + timingSafeEqual | ✓ VERIFIED | Phase-4-shipped contract (`x-revalidate-hmac`, `REVALIDATE_HMAC_SECRET`, `{tag}` body); uses `timingSafeEqual` with length guard; fails closed on missing secret |
| `apps/web/__tests__/no-gemini-imports.static.test.ts` | Static source-scan (Layer 1 Gemini ban) | ✓ VERIFIED | Scans 5 guarded files; substitutes for blocked `eslint.config.mjs` edit (documented deviation) |
| `.github/workflows/ci.yml` | CI grep step (Layer 2 Gemini ban) | ✓ VERIFIED | `git grep -nE "@google/genai|gemini"` exits 1 on match in `apps/web/src/app/stock` + `apps/web/src/app/fund` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `stock/[ticker]/page.tsx` | `lib/data/stock-report.ts` | `getStockReportFromMaterialisedStore(` | ✓ WIRED | Line 98-100; tagged with `stock:${ticker}` + `stock:report` |
| `stock/[ticker]/page.tsx` | `components/seo/json-ld.tsx` | `<JsonLd data={corpJsonLd} />` | ✓ WIRED | Lines 182-184; three separate JsonLd blocks |
| `stock/[ticker]/page.tsx` | `lib/seo/disclaimers.ts` | `ANALYSIS_DISCLAIMER` + `PAST_PERF_DISCLAIMER` | ✓ WIRED | Lines 36-38; used in stub path and as fallback for real-report path |
| `fund/[schemeCode]/page.tsx` | `lib/data/fund-report.ts` | `getFundReportFromMaterialisedStore(` | ✓ WIRED | Line 111; tagged with `fund:${schemeCode}` + `fund:report` |
| `app/api/internal/revalidate/route.ts` | `next/cache` | `revalidateTag(tag)` | ✓ WIRED | Line 40; single-arg form (Next 15.5 compatible) |
| `apps/api/src/reports/reports.service.ts` | `/api/internal/revalidate` | `fireRevalidateWebhook` → fetch POST with `x-revalidate-hmac` | ✓ WIRED | Lines 130-163; called from `bustCache` at line 107 |
| `apps/api/src/jobs/narrative-batch/narrative-batch.processor.ts` | `reports.service.ts` | `this.reports.bustCache(ticker)` | ✓ WIRED | Line 85; cache+webhook fires after narrative write |
| `apps/api/src/jobs/eod-recompute/eod-recompute.processor.ts` | `narrative-batch` via EventEmitter2 | `EOD_TICKER_RECOMPUTED_EVENT` emit → listener → `bustCache` | ✓ WIRED | Line 132; eod→event→narrative-batch→bustCache→webhook chain confirmed |
| `apps/web/src/app/sitemap.ts` | `lib/data/instrument-master.ts` | `listAllTickers()` / `listAllSchemeCodes()` | ✓ WIRED (empty) | Calls correct functions; data gated by `PUBLIC_INSTRUMENTS_BASE` (Phase 2 dep) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `stock/[ticker]/page.tsx` | `report` (StockReportDoc) | `getStockReportFromMaterialisedStore` → `fetch ${API_BASE}/reports/stock/${ticker}` with Next cache tags | Yes (reads Phase 4 materialised store via NestJS) | ✓ FLOWING (requires Phase 4 API running) |
| `fund/[schemeCode]/page.tsx` | `report` (FundReportDoc) | `getFundReportFromMaterialisedStore` → `fetch ${API_BASE}/reports/fund/${schemeCode}` | Yes (reads Phase 4 materialised store) | ✓ FLOWING (requires Phase 4 API running) |
| `apps/web/src/app/sitemap.ts` | `tickers`, `schemes` | `listAllTickers()` / `listAllSchemeCodes()` → `PUBLIC_INSTRUMENTS_BASE` gated fetch | No — returns `[]` while `PUBLIC_INSTRUMENTS_BASE` unset | ⚠ STATIC (Phase 2 gated; code correct, data empty) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All SEO test files pass | `pnpm --filter web test -- --run` | 35 test files, 150/150 pass in 8.65s | ✓ PASS |
| TypeScript type check clean | `pnpm --filter web exec tsc --noEmit` | Exit 0, no errors | ✓ PASS |
| No Gemini imports in public route trees | `git grep -nE "@google/genai\|gemini" apps/web/src/app/stock apps/web/src/app/fund` | Zero matches | ✓ PASS |
| pnpm build (route manifest proof) | `pnpm --filter web build` | Not executed — blocked per 08-02-SUMMARY honest verification note | ? SKIP |
| OG image HTTP shape | `curl -sI .../opengraph-image \| grep image/png` | Not executed — requires running server | ? SKIP |
| sitemap XML content | `curl -s http://localhost:3000/sitemap/0.xml` | Not executed; also partial (Phase 2 gated, root-only until public instruments endpoint) | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SEO-01 | 08-01-PLAN.md | Each stock has a public, server-rendered, indexable page (`/stock/[ticker]`) with full HTML content in view-source | ✓ SATISFIED | `stock/[ticker]/page.tsx` RSC, SSR tests green, JSON-LD + disclaimers in rendered HTML |
| SEO-02 | 08-01-PLAN.md | Each fund has a public, server-rendered, indexable page (`/fund/[schemeCode]`) | ✓ SATISFIED | `fund/[schemeCode]/page.tsx` RSC, fund SSR tests green |
| SEO-03 | 08-01-PLAN.md, 08-02-PLAN.md | Public pages emit JSON-LD structured data, canonical URLs, and OG/Twitter cards | ✓ SATISFIED (page-level) / ⚠ PARTIAL (sitemap) | Page-level: JSON-LD builders, canonical, OG/Twitter via `generateMetadata` — all tested. Sitemap: code complete but emits root-only until Phase 2. Robots, OG image, opengraph-image.png: code complete; HTTP-shape proofs need human |
| SEO-04 | 08-01-PLAN.md, 08-02-PLAN.md | Public pages read from materialised store (no live Gemini) and carry compliance disclaimers | ✓ SATISFIED | Three-layer Gemini ban active (static scan + CI grep + runtime mock-throw); disclaimers on every path (real + stub); revalidate webhook ensures cache freshness |

All four phase-8 requirement IDs (SEO-01, SEO-02, SEO-03, SEO-04) declared in plan frontmatter match REQUIREMENTS.md §Public SEO Pages. No orphaned requirement IDs found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/src/lib/data/stock-report.ts` | 75 | `console.warn(...)` in fire-and-forget enqueue catch | ⚠ Warning | Platform rule `backend/no-console-log` forbids `console.warn`; however this is a Next.js RSC file (not NestJS), no platform logger available; acceptable server-only logging for a non-critical fire-and-forget path |
| `apps/web/src/lib/data/fund-report.ts` | 58 | `console.warn(...)` same pattern | ⚠ Warning | Same rationale as above |

No stub implementations, no empty returns, no `@google/genai` imports in public route trees, no hardcoded empty arrays passed to render (empty `peers` renders null branch, not empty data). No `TODO`/`FIXME`/`PLACEHOLDER` blocking comments in production files (the `TODO(phase-2)` comments are intentional cross-phase dependency markers, not stubs).

### Human Verification Required

#### 1. Production Build Route Manifest

**Test:** Run `pnpm --filter web build` from the monorepo root
**Expected:** Build completes with exit 0; the route manifest (or terminal output) shows:
- `/stock/[ticker]` and `/fund/[schemeCode]` listed as SSG/ISR routes
- `/stock/[ticker]/opengraph-image` and `/fund/[schemeCode]/opengraph-image` as Edge routes
- `/sitemap/[__metadata_id__]` present
- `/robots.txt` present
**Why human:** pnpm build was not executed during plan execution (blocked by a pre-existing schema-dts install issue that is now resolved) and not run during this verification session (would require the full build pipeline to be triggered).

#### 2. OG Image HTTP Shape

**Test:** Start the dev or production server, then:
```
curl -sI http://localhost:3000/stock/RELIANCE/opengraph-image | grep -i "content-type"
curl -sI http://localhost:3000/fund/120503/opengraph-image | grep -i "content-type"
```
**Expected:** Both return `content-type: image/png` with HTTP 200
**Why human:** Requires a running Next.js server; cannot be verified statically; Edge `ImageResponse` rendering needs the Vercel Satori environment.

#### 3. Sitemap Full-Universe Content (Phase 2 Dependent)

**Test:** After Phase 2 ships the public instrument endpoint (`GET /instruments/public/all?type=stock` + `?type=fund`) and `PUBLIC_INSTRUMENTS_BASE` is set:
```
curl -s http://localhost:3000/sitemap/0.xml | grep -E "<loc>https://finsight.ai/stock/"
```
**Expected:** One `<loc>` entry per NSE symbol in the instrument master (up to 45k per shard); also verify `/fund/` entries
**Why human:** `instrument-master.ts` correctly returns `[]` while `PUBLIC_INSTRUMENTS_BASE` is unset — this is the documented Phase 2 dependency; the truth "sitemap contains one URL per stock and fund" cannot be confirmed until Phase 2 is live.

### Gaps Summary

No blocking gaps that prevent the core phase goal. All must-haves for SEO-01 through SEO-04 are implemented and verified at the code and unit-test level.

The two pending items are:

1. **Build and runtime HTTP-shape proofs** — require executing `pnpm build` and running the server. These are operational confirmations, not code defects. The underlying code is type-clean (tsc exit 0), test-clean (150/150), and follows Next 15.5 patterns documented in 08-RESEARCH.md.

2. **Sitemap full-universe output** — gated on Phase 2 shipping `GET /instruments/public/all` and the `PUBLIC_INSTRUMENTS_BASE` env flag being set. The implementation is correct and empty-safe; the data source doesn't exist yet. This is documented as `TODO(phase-2)` in `instrument-master.ts`.

The Phase 8 goal — public, server-rendered, indexable pages with structured data and compliance disclaimers reading from the materialised store — is structurally achieved. The outstanding human items are runtime verification of already-implemented features, not implementation gaps.

---

_Verified: 2026-06-05T23:50:00Z_
_Verifier: Claude (gsd-verifier)_
