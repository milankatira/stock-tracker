---
phase: 08-public-seo-pages
plan: 01
subsystem: ui
tags: [next15, rsc, seo, json-ld, schema-dts, isr, generateMetadata, compliance, sebi]

# Dependency graph
requires:
  - phase: 04-report-generation
    provides: "StockReportDoc / FundReportDoc materialised report DTOs + Verdict enum (@finsight/shared)"
  - phase: 02-instrument-master
    provides: "InstrumentDto (primaryExchange, nseSymbol, bseCode) for dual-listing canonical preference"
provides:
  - "Public, crawler-indexable /stock/[ticker] and /fund/[schemeCode] RSC pages (full report HTML in view-source)"
  - "Typed JSON-LD builders (Corporation/FinancialProduct + Article + BreadcrumbList) with no Review/Rating (SEBI-safe)"
  - "Canonical URL builder with NSE-preference for dual-listed stocks"
  - "Cookieless materialised-store read path + fire-and-forget ad-hoc compute enqueue for long-tail"
  - "Three-layer live-model-SDK ban (static scan + CI grep + runtime mock-throw)"
  - "Authed report routes relocated to /app/stock and /app/fund (route-collision fix)"
affects: [08-02-sitemap-robots-ogimage, seo, crawler-indexing, revalidate-webhook]

# Tech tracking
tech-stack:
  added: [schema-dts]
  patterns:
    - "Pure-RSC public page: await all data at top, return fully-sync tree so renderToStaticMarkup/crawlers see full HTML (no Suspense streaming)"
    - "Public read path is cookieless (x-internal-secret header) so generateStaticParams + ISR stay valid"
    - "Compliance disclaimers rendered on every public page; prefer DTO copy, fall back to shared constant"

key-files:
  created:
    - apps/web/src/app/stock/[ticker]/page.tsx
    - apps/web/src/app/fund/[schemeCode]/page.tsx
  modified:
    - apps/web/src/app/(app)/app/stock/[ticker]/page.tsx (relocated)
    - apps/web/src/app/(app)/app/fund/[schemeCode]/page.tsx (relocated)
    - apps/web/src/app/(app)/search/page.tsx
    - apps/web/src/app/_components/reports/PeerCard.tsx
    - apps/web/src/app/_components/fund-reports/FundPeerCard.tsx
    - apps/web/src/app/_components/fund-reports/HigherScoringPeersCard.tsx

key-decisions:
  - "Option 1 (Relocate & preserve): moved authed (app)/stock + (app)/fund to (app)/app/... so public SEO pages own /stock + /fund without a Next route collision"
  - "Rendered disclaimers inline in each page (not the planned components/compliance/disclaimers.tsx) — single small footer component per page, fewer files"
  - "Followed the RED tests' async params (Promise<...>) over plan line 381's stale 'sync params' note (Next 15.5 uses async params)"

patterns-established:
  - "Public RSC page: top-level await + sync tree for crawler-visible HTML"
  - "DTO-first compliance copy with shared-constant fallback so the past-performance disclaimer is never missing"
  - "Authed app surface links use /app/stock|/app/fund; public/public peer links use /stock|/fund"

requirements-completed: [SEO-01, SEO-02, SEO-03, SEO-04]

# Metrics
duration: 29min
completed: 2026-06-05
---

# Phase 8 Plan 01: Public SEO Pages Summary

**Crawler-indexable Next 15 RSC pages for /stock/[ticker] and /fund/[schemeCode] that render the full FinSight report (score, verdict, narrative, disclaimers) plus SEBI-safe JSON-LD in view-source HTML, with the authed report routes relocated under /app to clear the route collision.**

## Performance

- **Duration:** ~29 min (plan total, across Wave-0 scaffold + this continuation)
- **Started:** 2026-06-05T16:39Z (Wave-0 scaffold)
- **Completed:** 2026-06-05T17:08Z
- **Tasks:** 6 (test scaffold, SEO libs/views, route relocation, two public pages, green-up, lint/type)
- **Files modified:** 16 in this plan (10 in continuation)

## Accomplishments
- Public `/stock/[ticker]` and `/fund/[schemeCode]` RSC pages: full report HTML server-rendered for crawlers, no client JS needed for indexable content.
- `generateStaticParams` (top cohort) + `dynamicParams=true` + `revalidate=86400` + `generateMetadata` (canonical, OG `article`, Twitter `summary_large_image`, `robots:{index:false}` on stubs).
- Three JSON-LD blocks per page (Corporation/FinancialProduct + Article + BreadcrumbList); zero Review/Rating/aggregateRating (SEBI safety).
- Long-tail tickers/funds render a noindex stub + fire-and-forget ad-hoc compute enqueue.
- Path-param validation (`/^[A-Z0-9-]{1,15}$/` ticker, `/^[0-9]{1,7}$/` scheme) → `notFound()` (threats T-08-01/02).
- Relocated authed report routes to `/app/stock` + `/app/fund` and repointed all authed-surface nav links, so authed users keep the rich view and the public routes own the bare paths.
- Full suite green: 136/136 vitest, eslint clean, `tsc --noEmit` clean.

## Task Commits

1. **Wave-0 SEO scaffolds + three-layer model-SDK ban** - `2bc9e32` (test) — pre-existing
2. **SEO libs + data read path + public report views** - `bfe51cd` (feat) — pre-existing
3. **Relocate authed stock/fund routes to /app segment** - `2b44602` (refactor)
4. **Public SEO stock + fund report pages** - `7054e35` (feat)

**Plan metadata:** committed separately (docs).

## Files Created/Modified
- `apps/web/src/app/stock/[ticker]/page.tsx` - Public stock RSC: data fetch, metadata, JSON-LD, disclaimers, stub path, param validation.
- `apps/web/src/app/fund/[schemeCode]/page.tsx` - Public fund RSC: same structure for funds.
- `apps/web/src/app/(app)/app/stock/[ticker]/{page,loading}.tsx` - Relocated authed stock report (from `(app)/stock`).
- `apps/web/src/app/(app)/app/fund/[schemeCode]/{page,loading}.tsx` - Relocated authed fund report (from `(app)/fund`).
- `apps/web/src/app/(app)/search/page.tsx` - Search results now route to `/app/stock` / `/app/fund`.
- `apps/web/src/app/_components/reports/PeerCard.tsx` + test - Authed stock peer links → `/app/stock`.
- `apps/web/src/app/_components/fund-reports/FundPeerCard.tsx` - Authed fund peer links → `/app/fund`.
- `apps/web/src/app/_components/fund-reports/HigherScoringPeersCard.tsx` + test - Authed peer links → `/app/fund`.
- `apps/web/__tests__/{stock,fund}-page.ssr.test.tsx` - Narrowed `OpenGraph.type` access for `tsc`.

## Decisions Made
- **Option 1 — Relocate & preserve** (user-confirmed): the static-scan test hardcodes the public pages at `src/app/stock/[ticker]` and `src/app/fund/[schemeCode]`, which resolve to the same `/stock` `/fund` URLs as the existing `(app)` pages → `next build` route collision. Moved the authed pages to `(app)/app/...` (URL `/app/stock`, `/app/fund`), staying inside the `(app)` group (no `(app)/layout.tsx` exists, so this is a clean, minimal move; `@/`-absolute imports mean no path breakage).
- **No middleware existed**, so there was no auth wall to reconcile and no protection regression — the relocation only required repointing in-app navigation links.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint Layer-1 ban delivered as a static source-scan test**
- **Found during:** Wave-0 scaffold (Task 1)
- **Issue:** Plan specified a `no-restricted-imports` fence in `apps/web/eslint.config.mjs`, but the repo's config-protection hook rejects any create/edit of `eslint.config.mjs`.
- **Fix:** Layer 1 of the model-SDK ban is implemented as `__tests__/no-gemini-imports.static.test.ts` (source-text scan of the guarded files) — a genuinely independent check alongside the CI grep (Layer 2) and runtime mock-throw (Layer 3).
- **Files modified:** apps/web/__tests__/no-gemini-imports.static.test.ts
- **Committed in:** `2bc9e32`

**2. [Rule 1 - Bug] Fixtures reconciled to the real Phase-4 DTOs, not the plan's stale `<interfaces>` sample**
- **Found during:** Wave-0 scaffold (Task 1)
- **Issue:** Plan `<interfaces>` sample (`{symbol, exchange, verdictLabel, oneLineSummary}`) predates the actual `StockReportDoc`/`FundReportDoc` contract in `@finsight/shared`.
- **Fix:** Fixtures + views + JSON-LD builders align to the real DTO shape (per the plan's own "do NOT invent fields" instruction). The one-line summary sources from `narrative.paragraph` (no dedicated one-liner field exists).
- **Files modified:** apps/web/__tests__/fixtures/instrument-master.ts and the SEO libs/views
- **Committed in:** `2bc9e32`, `bfe51cd`

**3. [Rule 3 - Blocking] instrument-master returns empty/null until a PUBLIC Phase-2 endpoint exists**
- **Found during:** SEO libs (Task 2)
- **Issue:** The only instruments endpoint (`GET /search/instruments`) is behind `AccessTokenGuard`; a build-time/crawler request cannot use it, so `generateStaticParams` and dual-listing canonical have no public data source yet.
- **Fix:** `getTopNTickers` / `getTopNFundSchemeCodes` / `getStockInstrument` return `[]`/`null` (gated behind `PUBLIC_INSTRUMENTS_BASE`). `generateStaticParams` prerenders 0 routes; the long tail still renders correctly via ISR. Documented `TODO(phase-2)` to wire the public endpoint and flip the env flag. Canonical falls back to the route symbol (correct for every non-dual-listed and NSE-routed stock).
- **Files modified:** apps/web/src/lib/data/instrument-master.ts
- **Committed in:** `bfe51cd`

**4. [Rule 1 - Bug] Async `params` correction (Next 15.5), overriding plan line 381**
- **Found during:** Public pages (Task 4)
- **Issue:** Plan line 381 asserts dynamic-route `params` is a SYNC object. The RED SSR tests (source of truth) pass `params: Promise.resolve(...)` and the page must `await params` — Next 15 made `params` async.
- **Fix:** Both pages type `params: Promise<...>` and `await params` before use; `generateMetadata` does the same. Confirmed against the passing SSR tests.
- **Files modified:** apps/web/src/app/stock/[ticker]/page.tsx, apps/web/src/app/fund/[schemeCode]/page.tsx
- **Committed in:** `7054e35`

**5. [Rule 2 - Missing Critical] Past-performance disclaimer fallback**
- **Found during:** Public pages (Task 5, type-check)
- **Issue:** `Disclaimers.pastPerformance` is optional in the shared DTO (`string | undefined`); compliance (NON-NEGOTIABLE) requires the past-performance disclaimer on every returns view.
- **Fix:** Real-report path renders `report.disclaimers.pastPerformance ?? PAST_PERF_DISCLAIMER` so the disclaimer is never absent. Real-report path uses DTO compliance copy (avoids the "educational purposes" loophole phrase that lives in the shared constant); the constant is reserved for the stub path.
- **Files modified:** apps/web/src/app/stock/[ticker]/page.tsx, apps/web/src/app/fund/[schemeCode]/page.tsx
- **Committed in:** `7054e35`

**6. [Rule 3 - Blocking] Disclaimers rendered inline instead of `components/compliance/disclaimers.tsx`**
- **Found during:** Public pages (Task 4)
- **Issue:** Plan listed a shared `<Disclaimers context="report" />` component at `apps/web/src/components/compliance/disclaimers.tsx`; it was never created in the SEO-libs commit.
- **Fix:** Each page renders a small local `PublicDisclaimers` footer (analysis + past-performance) rather than introducing a new shared component. Satisfies every disclaimer must-have in server-rendered HTML.
- **Files modified:** apps/web/src/app/stock/[ticker]/page.tsx, apps/web/src/app/fund/[schemeCode]/page.tsx
- **Committed in:** `7054e35`

**7. [Rule 2 - Missing Critical / Compliance] Removed the "educational purposes" loophole phrase from the stub disclaimer constant**
- **Found during:** Final compliance review (Task 6)
- **Issue:** `ANALYSIS_DISCLAIMER` ended with "Information provided is for educational purposes only." CLAUDE.md compliance is NON-NEGOTIABLE and explicitly forbids relying on the "educational" loophole. The real-report path already uses DTO copy (which omits the phrase), but the long-tail stub path renders this constant verbatim to real users.
- **Fix:** Dropped the offending sentence from the constant. SSR tests only assert "Analysis, not investment advice" + "Past performance", so they stay green (136/136).
- **Files modified:** apps/web/src/lib/seo/disclaimers.ts
- **Verification:** vitest 136/136 pass after edit.
- **Committed in:** (compliance fix commit, post-summary)

---

**Total deviations:** 7 auto-fixed (3 blocking, 2 bug, 2 missing-critical/compliance)
**Impact on plan:** All deviations were required for correctness, compliance, or to compile/build. The only structural change — the Option-1 route relocation — was user-confirmed. No scope creep.

## Issues Encountered
- The shell's profile defines a broken `_lc` wrapper that aborts any `cd &&`-chained command; worked around it with `git -C` and standalone script files run via `bash`. No effect on deliverables.

## Known Stubs
- `getTopNTickers` / `getTopNFundSchemeCodes` / `getStockInstrument` return `[]`/`null` until Phase 2 exposes a PUBLIC instrument endpoint (gated behind `PUBLIC_INSTRUMENTS_BASE`). Intentional and correct: `generateStaticParams` prerenders 0 routes and the long tail renders via ISR; resolved when Phase 2 lands the public endpoint. Tracked via `TODO(phase-2)` in `instrument-master.ts`.
- Long-tail StubPage is intentional (noindex placeholder + ad-hoc compute enqueue), not a data-wiring gap.

## User Setup Required
None for tests/build. For production prerender + dual-listing canonical, set `PUBLIC_INSTRUMENTS_BASE` once Phase 2's public instrument endpoint exists. `INTERNAL_API_SECRET` / `API_BASE` drive the materialised-store read path.

## Next Phase Readiness
- Plan 08-02 can build `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, and the `revalidateTag` webhook on top of these pages.
- Public pages are SDK-free and crawler-ready; SEO-03 page-level meta + JSON-LD is done (sitemap/robots/OG-image bytes remain for Plan 02).

## Self-Check: PASSED

- FOUND: `apps/web/src/app/stock/[ticker]/page.tsx`
- FOUND: `apps/web/src/app/fund/[schemeCode]/page.tsx`
- FOUND: `.planning/phases/08-public-seo-pages/08-01-SUMMARY.md`
- FOUND commit `2b44602` (route relocation)
- FOUND commit `7054e35` (public pages)
- Verification: 136/136 vitest pass, eslint clean, `tsc --noEmit` clean.
- Route topology PROVEN via `pnpm build`: `/stock/[ticker]` + `/fund/[schemeCode]` build as public SSG pages and `/app/stock/[ticker]` + `/app/fund/[schemeCode]` as authed dynamic pages — no collision.

---
*Phase: 08-public-seo-pages*
*Completed: 2026-06-05*
