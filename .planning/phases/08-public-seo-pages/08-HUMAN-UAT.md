---
status: partial
phase: 08-public-seo-pages
source: [08-VERIFICATION.md]
started: 2026-06-05T18:10:00.000Z
updated: 2026-06-05T18:25:00.000Z
---

## Current Test

[done — 2/3 verified live in-session; item 3 deferred cross-phase]

## Tests

### 1. Build route manifest

expected: `pnpm --filter web build` succeeds; route manifest shows `/stock/[ticker]` and `/fund/[schemeCode]` as SSG, `/sitemap/[__metadata_id__]` serving `/sitemap/0.xml`, `/robots.txt`, and both `opengraph-image` routes.
result: PASSED — build run in-session 2026-06-05: `● /stock/[ticker]` SSG, `● /fund/[schemeCode]` SSG, `● /sitemap/[__metadata_id__]` → `/sitemap/0.xml`, `○ /robots.txt`, `ƒ` OG routes both present; authed `/app/stock` + `/app/fund` dynamic.

### 2. OG image HTTP shape

expected: `curl -sI http://localhost:3000/stock/RELIANCE/opengraph-image` returns `200` with `content-type: image/png` (defensive fallback even without API up).
result: PASSED — `next start` against the production build (API down): stock OG → `status=200 type=image/png`; fund OG → `status=200 type=image/png`; `robots.txt` serves correct Allow/Disallow + `Sitemap: https://finsight.ai/sitemap/0.xml`; `/sitemap/0.xml` valid urlset XML. Note: `/stock/RELIANCE` page itself returns 500 on cold miss with API fully down (fetch ECONNREFUSED) — correct transient-outage semantics (crawler retries; stub-with-noindex would risk de-indexing).

### 3. Sitemap full-universe content

expected: Once Phase 2 ships the public instruments endpoint (`PUBLIC_INSTRUMENTS_BASE`), `/sitemap/0.xml` lists every stock and fund URL. Currently emits root-only URL (correct empty-safe behavior, `TODO(phase-2)` documented).
result: [pending — gated on Phase 2 public instruments endpoint; deferred by design]

## Summary

total: 3
passed: 2
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
