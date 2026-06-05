---
phase: 08-public-seo-pages
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - .github/workflows/ci.yml
  - apps/web/__tests__/fixtures/instrument-master.ts
  - apps/web/__tests__/fund-page.no-gemini.test.tsx
  - apps/web/__tests__/fund-page.ssr.test.tsx
  - apps/web/__tests__/no-gemini-imports.static.test.ts
  - apps/web/__tests__/seo/canonical.test.ts
  - apps/web/__tests__/seo/jsonld.test.ts
  - apps/web/__tests__/seo/robots.test.ts
  - apps/web/__tests__/seo/sitemap.test.ts
  - apps/web/__tests__/stock-page.no-gemini.test.tsx
  - apps/web/__tests__/stock-page.ssr.test.tsx
  - apps/web/src/app/(app)/app/fund/[schemeCode]/page.tsx
  - apps/web/src/app/(app)/app/stock/[ticker]/page.tsx
  - apps/web/src/app/(app)/search/page.tsx
  - apps/web/src/app/_components/fund-reports/FundPeerCard.tsx
  - apps/web/src/app/_components/fund-reports/HigherScoringPeersCard.tsx
  - apps/web/src/app/_components/reports/PeerCard.tsx
  - apps/web/src/app/api/internal/revalidate/route.test.ts
  - apps/web/src/app/fund/[schemeCode]/opengraph-image.tsx
  - apps/web/src/app/fund/[schemeCode]/page.tsx
  - apps/web/src/app/robots.ts
  - apps/web/src/app/sitemap.ts
  - apps/web/src/app/stock/[ticker]/opengraph-image.tsx
  - apps/web/src/app/stock/[ticker]/page.tsx
  - apps/web/src/components/compliance/disclaimers.tsx
  - apps/web/src/components/reports/public-fund-report-view.tsx
  - apps/web/src/components/reports/public-stock-report-view.tsx
  - apps/web/src/components/reports/stub-page.tsx
  - apps/web/src/components/seo/json-ld.tsx
  - apps/web/src/lib/data/fund-report.ts
  - apps/web/src/lib/data/instrument-master.ts
  - apps/web/src/lib/data/stock-report.ts
  - apps/web/src/lib/seo/canonical.ts
  - apps/web/src/lib/seo/disclaimers.ts
  - apps/web/src/lib/seo/jsonld.ts
  - apps/web/vitest.config.ts
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-06-05T00:00:00Z
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found

## Summary

The Phase 08 public SEO surface is well-architected and the core invariants are
genuinely enforced: the three-layer model-SDK ban (static scan + CI grep +
runtime mock-throw) is real and independent; the revalidate webhook uses
constant-time HMAC comparison with correct length/malformed-hex guards; JSON-LD
deliberately omits `Review`/`Rating`/`aggregateRating` (SEBI safety) and the test
recursively asserts it; disclaimers are present on every surface including the
long-tail stub; and the pages are pure RSC so crawlers see full HTML. The data
layer is cookieless and reads only the materialised store — no live Gemini on the
crawler path. Secrets are env-sourced, never `NEXT_PUBLIC_`.

The one Critical issue is a regression risk hiding in plain sight: the stock
ticker validation regex rejects `&` and `.`, which are present in major NSE
symbols (M&M, M&MFIN, J&KBANK, L&TFH, BAJAJ-AUTO is fine but M&M is not). Those
large-cap pages would 404 and de-index — the exact opposite of this phase's goal.
The fixtures (RELIANCE/ONGC/TCS) all avoid `&`, so no test catches it. The
remaining items are defense-in-depth hardening (JSON-LD `</script>` escaping, OG
route param validation) and consistency.

## Critical Issues

### CR-01: Ticker regex rejects valid NSE symbols (`&`, `.`) — major-cap pages 404 / de-index

**File:** `apps/web/src/app/stock/[ticker]/page.tsx:47` (and the duplicate guard at `:85`, `:140`)
**Issue:** `TICKER_RE = /^[A-Z0-9-]{1,15}$/` only permits uppercase alphanumerics
and dash. Real NSE symbols contain `&` and `.` — e.g. `M&M` (Mahindra & Mahindra),
`M&MFIN`, `J&KBANK`, `L&TFH`, `BAJAJ-AUTO` (dash ok). For any `&`/`.` ticker:
- `generateMetadata` (line 85) returns `robots: { index: false, follow: true }`
- `StockPage` (line 140) calls `notFound()`

So `/stock/M&M` returns a 404 and is explicitly de-indexed — a direct regression
against SEO-01 for some of the most-searched Indian stocks. No existing test
catches it because every fixture symbol (`RELIANCE`, `ONGC`, `IOC`, `BPCL`,
`TCS`, `INFY`) is `&`-free.

Compounding: even once the symbol is accepted, the canonical builder
(`canonical.ts:28`), the sitemap (`sitemap.ts:63`), and the peer hrefs
(`public-stock-report-view.tsx:73`) interpolate the raw symbol into the URL path
without `encodeURIComponent`, so `&` would break the emitted URL.

**Fix:**
```ts
// page.tsx — widen to the real NSE symbol charset (uppercase alnum, & . - _),
// still length-bounded.
const TICKER_RE = /^[A-Z0-9&.\-_]{1,15}$/;
```
Add a fixture + SSR test for an `&`-ticker (`M&M`). And percent-encode the symbol
wherever it is placed into a URL path:
```ts
// canonical.ts
return `${SITE}/stock/${encodeURIComponent(input.symbol)}`;
// sitemap.ts
url: `${SITE}/stock/${encodeURIComponent(t.symbol)}`,
// public-stock-report-view.tsx
href={`/stock/${encodeURIComponent(peer.ticker)}`}
```

## Warnings

### WR-01: `JsonLd` does not escape `</script>` in serialized data (stored-XSS hardening)

**File:** `apps/web/src/components/seo/json-ld.tsx:23`
**Issue:** `dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}`.
`JSON.stringify` does NOT escape `<` / `>`, so a value containing the literal
`</script>` (e.g. inside `report.name`, `narrative.paragraph`, `category`, or
`meta.managerName`) terminates the `<script>` block early and lets following
characters render as live HTML. These fields originate from third-party feeds
(Yahoo, AMFI, MFAPI) and Gemini narrative — not end-user input, so exploitability
requires a poisoned upstream field, hence Warning not Critical. The file comment
asserting "no injection surface" is too strong: third-party data is untrusted.
**Fix:**
```tsx
dangerouslySetInnerHTML={{
  __html: JSON.stringify(data).replace(/</g, "\\u003c"),
}}
```

### WR-02: OG image routes skip param validation while attaching the internal secret

**File:** `apps/web/src/app/stock/[ticker]/opengraph-image.tsx:49-57`,
`apps/web/src/app/fund/[schemeCode]/opengraph-image.tsx:32-39`
**Issue:** Unlike `page.tsx`, the OG routes take the raw route param and call
`getStockReportFromMaterialisedStore(upper, ...)` →
`fetch(\`${API_BASE}/reports/stock/${ticker}\`, { headers: internalHeaders() })`
with the `x-internal-secret` header, with no `TICKER_RE` / `SCHEME_RE` guard. The
param flows unvalidated into an internal-API URL that carries the privileged
secret. Even if Next routing blocks `%2F`, the validation asymmetry is a concrete
defense-in-depth gap — the page guards the same input but the OG route does not.
**Fix:** apply the same regex guard at the top of each OG handler and fall through
to the default branded card (the routes already have a `catch` fallback path) when
the param fails validation:
```ts
const upper = ticker.toUpperCase();
if (!/^[A-Z0-9&.\-_]{1,15}$/.test(upper)) {
  return new ImageResponse(/* default branded card */, { ...size });
}
```

### WR-03: `enqueueAdHocStockCompute` is fired with `void` but is only `try/catch`-safe internally — unhandled rejection risk if implementation changes

**File:** `apps/web/src/app/stock/[ticker]/page.tsx:148`,
`apps/web/src/app/fund/[schemeCode]/page.tsx:116`
**Issue:** `void enqueueAdHocStockCompute(upper)` relies on the function never
rejecting. It currently wraps its `fetch` in `try/catch` (stock-report.ts:64,
fund-report.ts:48), so today this is safe. But the safety lives entirely in the
callee; if a future edit moves work outside that `try` (e.g. building the URL,
reading env), the `void`-discarded promise rejects with no handler and crashes the
request on some runtimes. This is a latent coupling, not a present bug.
**Fix:** make the fire-and-forget explicit at the call site so it is robust
regardless of callee internals:
```ts
void enqueueAdHocStockCompute(upper).catch(() => undefined);
```

### WR-04: `summaryOf` returns the full paragraph despite its "first sentence" contract

**File:** `apps/web/src/lib/seo/jsonld.ts:41-45`
**Issue:** The doc comment says "First sentence of the narrative, used as the
Article description / summary," but the body returns the entire `paragraph`
unmodified. The page-level `description` is correctly truncated to 160 chars
(`page.tsx:112`), but the JSON-LD `Article.description` emits the full paragraph —
an inconsistency between the meta description and the structured-data description,
and a misleading comment. Not a crash, but a correctness/maintainability gap that
will surprise the next editor.
**Fix:** either align the implementation to the comment (truncate / first
sentence) or correct the comment to "Full narrative paragraph, or the fallback."
Prefer matching the 160-char convention used for the meta description for
consistency.

## Info

### IN-01: `DisclaimerProps.context` is accepted but never used

**File:** `apps/web/src/components/compliance/disclaimers.tsx:18,23`
**Issue:** The `context: "report" | "fund-report"` prop is declared and required
but never referenced in the component body (only `analysis`/`pastPerformance` are
destructured). Note this `Disclaimers` component is not the one actually rendered
by the pages — both pages define their own inline `PublicDisclaimers`. Dead prop +
possibly dead component.
**Fix:** remove the unused `context` prop, or wire it to differentiate copy; and
confirm whether `compliance/disclaimers.tsx` is reachable at all — if not, delete
it to avoid drift with the inline `PublicDisclaimers`.

### IN-02: Disclaimer copy is duplicated across three render paths

**File:** `apps/web/src/app/stock/[ticker]/page.tsx:202-212`,
`apps/web/src/app/fund/[schemeCode]/page.tsx:164-174`,
`apps/web/src/components/compliance/disclaimers.tsx:23-41`
**Issue:** Three near-identical disclaimer-footer components exist (two inline
`PublicDisclaimers`, one shared `Disclaimers`). The constants are shared, but the
rendering markup is triplicated, inviting divergence (the shared one uses
`<aside role="contentinfo">`, the inline ones use `<footer>`).
**Fix:** extract a single shared `PublicDisclaimers` component and import it in
both pages; delete the unused variant.

### IN-03: `SITE` env-default fallback duplicated across six files

**File:** `apps/web/src/app/stock/[ticker]/page.tsx:45`,
`fund/[schemeCode]/page.tsx:37`, `robots.ts:20`, `sitemap.ts:26`,
`lib/seo/jsonld.ts:23`, `lib/seo/canonical.ts:13`
**Issue:** `process.env.NEXT_PUBLIC_SITE_URL ?? "https://finsight.ai"` is repeated
verbatim in six files. A typo or default drift in one place produces inconsistent
canonical/sitemap/JSON-LD origins (a real SEO duplicate-content hazard).
**Fix:** centralize in one module (e.g. `lib/seo/site.ts` exporting `SITE`) and
import everywhere.

### IN-04: `cacheTagsFor` duplicated between page and OG route as inline literals

**File:** `apps/web/src/app/stock/[ticker]/opengraph-image.tsx:56`,
`fund/[schemeCode]/opengraph-image.tsx:38`
**Issue:** The OG routes inline `[\`stock:${upper}\`, "stock:report"]` rather than
reusing the page's `cacheTagsFor` helper. If the page's tag scheme changes, the OG
route's cache will silently diverge and a `revalidateTag` will not invalidate the
OG image.
**Fix:** export `cacheTagsFor` from a shared module and reuse it in the OG route.

---

_Reviewed: 2026-06-05T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
