---
phase: 08-public-seo-pages
fixed_at: 2026-06-05T18:03:12.556Z
review_path: .planning/phases/08-public-seo-pages/08-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-06-05T18:03:12.556Z
**Source review:** .planning/phases/08-public-seo-pages/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 Critical, 4 Warning; Info findings IN-01..IN-04 out of scope)
- Fixed: 5
- Skipped: 0

Verification: `pnpm --filter web test` → 35 files / 150 tests pass (including the 4
new CR-01 regression tests). `pnpm --filter web exec tsc --noEmit` → exit 0.

## Fixed Issues

### CR-01: Ticker regex rejects valid NSE symbols (`&`, `.`) — major-cap pages 404 / de-index

**Files modified:** `apps/web/src/app/stock/[ticker]/page.tsx`, `apps/web/src/lib/seo/canonical.ts`, `apps/web/src/app/sitemap.ts`, `apps/web/src/components/reports/public-stock-report-view.tsx`, `apps/web/__tests__/seo/canonical.test.ts`, `apps/web/__tests__/stock-page.ssr.test.tsx`
**Commit:** f830cf3
**Applied fix:** Widened `TICKER_RE` to `/^[A-Z0-9&.\-_]{1,15}$/` so `&`/`.` NSE
symbols (M&M, M&MFIN, J&KBANK, L&TFH) are accepted instead of 404'd and de-indexed.
Percent-encoded the symbol everywhere it enters a URL path: `canonical.ts` (BOTH
the plain-NSE branch AND the dual-listed BSE→NSE `nseSymbol` branch — the review
cited only line 28 but line 26 has the same hazard), `sitemap.ts`, and the peer
hrefs in `public-stock-report-view.tsx`. Added regression tests: SSR render of
`M&M` (asserts it does NOT 404 — pre-fix `notFound()` threw), `generateMetadata`
for `M&M` (asserts `robots.index !== false`), and two `buildCanonicalStockUrl`
assertions locking `M&M` → `.../stock/M%26M` on both the NSE and dual-listed paths.
Fund scheme codes are numeric (`SCHEME_RE = /^[0-9]{1,7}$/`) so fund URLs need no
encoding and were left unchanged.

### WR-01: `JsonLd` does not escape `</script>` in serialized data (stored-XSS hardening)

**Files modified:** `apps/web/src/components/seo/json-ld.tsx`
**Commit:** fa5991e
**Applied fix:** Changed the serialization to
`JSON.stringify(data).replace(/</g, "\\u003c")` so a literal `</script>` inside any
third-party-sourced field (report name, narrative, category, manager name) cannot
terminate the script block early. Updated the file-header comment, which previously
overclaimed "no injection surface," to state that third-party feed/Gemini data is
untrusted and is escaped.

### WR-02: OG image routes skip param validation while attaching the internal secret

**Files modified:** `apps/web/src/app/stock/[ticker]/opengraph-image.tsx`, `apps/web/src/app/fund/[schemeCode]/opengraph-image.tsx`
**Commit:** d3e566e
**Applied fix:** Added the per-route validation regex to each OG handler
(`TICKER_RE = /^[A-Z0-9&.\-_]{1,15}$/` for stock, `SCHEME_RE = /^[0-9]{1,7}$/` for
fund — matching each page) and wrapped the materialised-store fetch in
`if (REGEX.test(param)) { try {...} }`. The default `headline`/`sub` are already set
before the guard, so an invalid param falls through to the default branded card and
the privileged `x-internal-secret` is never attached to a fetch for an unvalidated
symbol. Minimal diff — no duplicated `ImageResponse` JSX.

### WR-03: `enqueueAdHoc*Compute` fired with `void` — unhandled-rejection risk if callee changes

**Files modified:** `apps/web/src/app/stock/[ticker]/page.tsx`, `apps/web/src/app/fund/[schemeCode]/page.tsx`
**Commit:** dcc8a31
**Applied fix:** Made the fire-and-forget explicit at both call sites:
`void enqueueAdHocStockCompute(upper).catch(() => undefined)` and the fund
equivalent. This is robust regardless of callee internals — a future edit moving
work outside the callee's `try/catch` can no longer surface an unhandled rejection
that crashes the request.

### WR-04: `summaryOf` returns the full paragraph despite its "first sentence" contract

**Files modified:** `apps/web/src/lib/seo/jsonld.ts`
**Commit:** 1675e52
**Applied fix:** Aligned the implementation to the meta-description convention:
`summaryOf` now returns `paragraph.slice(0, 160)`, matching the 160-char truncation
used for the page `description` (`page.tsx:112`), so the JSON-LD `Article.description`
and the `<meta name="description">` stay consistent. Corrected the misleading doc
comment (it no longer claims "first sentence"). SSR test still asserts
`"diversified conglomerate"` (~26 chars in, well under 160) and the full paragraph
still renders in the report body view.

---

_Fixed: 2026-06-05T18:03:12.556Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
