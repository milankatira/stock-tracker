---
phase: 08-public-seo-pages
plan: 02
subsystem: seo
tags: [next15, sitemap, robots, opengraph, next-og, revalidate, hmac, isr, seo]

# Dependency graph
requires:
  - phase: 08-public-seo-pages
    provides: "Public /stock/[ticker] + /fund/[schemeCode] RSC pages, instrument-master read layer, materialised-store fetch path (08-01)"
  - phase: 04-report-generation
    provides: "Already-shipped revalidate webhook: sender (reports.service + fund-reports.service fireRevalidateWebhook), receiver (app/api/internal/revalidate/route.ts), narrative-batch bustCache wiring"
provides:
  - "Dynamic sitemap.ts (full instrument universe, generateSitemaps 50k-cap split, empty-safe)"
  - "Typed robots.ts (allow /stock//fund/, disallow /api//app//auth/, sitemap link)"
  - "Per-ticker + per-fund next/og OG images + 1200x630 static brand fallback PNG"
  - "listAllTickers/listAllSchemeCodes full-universe readers on instrument-master"
  - "Documented revalidate-webhook env vars in both .env.example files"
affects: [seo, crawler-indexing, social-sharing, cache-invalidation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Empty-safe instrument-master readers gated by PUBLIC_INSTRUMENTS_BASE (return [] until Phase-2 public endpoint exists)"
    - "OG ImageResponse with defensive try/catch -> always 200 branded card (never throws on missing report / fetch failure)"
    - "Verdict->label map inlined in edge OG routes (no client VerdictBadge import in the image render path)"

key-files:
  created:
    - apps/web/src/app/sitemap.ts
    - apps/web/src/app/robots.ts
    - apps/web/src/app/stock/[ticker]/opengraph-image.tsx
    - apps/web/src/app/fund/[schemeCode]/opengraph-image.tsx
    - apps/web/src/app/opengraph-image.png
    - apps/web/__tests__/seo/sitemap.test.ts
    - apps/web/__tests__/seo/robots.test.ts
    - .planning/phases/08-public-seo-pages/deferred-items.md
  modified:
    - apps/web/src/lib/data/instrument-master.ts
    - apps/web/src/app/api/internal/revalidate/route.test.ts
    - apps/web/.env.example
    - .env.example

decisions:
  - "Task 3 conform-not-build: the revalidate webhook is already shipped end-to-end by Phase 4 under a self-consistent contract (/api/internal/revalidate, x-revalidate-hmac, {tag}, HMAC-over-tag). Building the plan's divergent duplicate would create dead/split-brain code. Conformed + documented the mapping instead."
  - "OG routes set runtime='edge' per plan done-criterion; data layer is fetch-based + server-only (both edge-compatible)"
  - "Static OG fallback PNG generated via a pure-Node PNG encoder (sharp's native binding was unresolvable in the worktree's symlinked node_modules)"

metrics:
  duration: ~32min
  completed: 2026-06-05
requirements-completed: [SEO-03]
---

# Phase 8 Plan 02: Sitemap, robots, OG images + revalidate-webhook closeout Summary

**Closes SEO-03 with a dynamic `sitemap.ts` + typed `robots.ts` driven by the instrument master, per-ticker/per-fund `next/og` OG images plus a static brand fallback, and reconciles the on-demand revalidate webhook against the contract Phase 4 had already shipped (rather than building the plan's divergent duplicate).**

## Performance
- **Duration:** ~32 min
- **Completed:** 2026-06-05
- **Tasks:** 3 (sitemap/robots, OG images, webhook closeout)
- **Files:** 8 created, 4 modified

## Task Commits
1. **sitemap.ts + robots.ts + listAll* readers + tests** — `43067a5` (feat)
2. **Per-route OG images + static brand fallback PNG** — `6269a98` (feat)
3. **Revalidate-webhook env docs + receiver edge-case tests** — `0961a91` (feat)
4. **runtime='edge' on both OG routes (plan done-criterion)** — `ff015aa` (feat)

## Files Created / Modified
- `apps/web/src/app/sitemap.ts` (78 lines) — one `<url>` per stock + per fund + root; `generateSitemaps` splits at a 45k margin under Google's 50k cap; empty universe → root-only sitemap.
- `apps/web/src/app/robots.ts` (27 lines) — allow `/`, `/stock/`, `/fund/`; disallow `/api/`, `/app/`, `/auth/`; links `/sitemap.xml`; sets `host`.
- `apps/web/src/app/stock/[ticker]/opengraph-image.tsx` (104 lines) — edge `ImageResponse` card; score + verdict label from the materialised store; defensive try/catch → 200 branded fallback.
- `apps/web/src/app/fund/[schemeCode]/opengraph-image.tsx` (86 lines) — fund mirror.
- `apps/web/src/app/opengraph-image.png` (24,690 bytes, 1200×630) — static brand gradient fallback.
- `apps/web/__tests__/seo/sitemap.test.ts` (91 lines) / `robots.test.ts` (30 lines) — 8 tests.
- `apps/web/src/lib/data/instrument-master.ts` — added `listAllTickers` / `listAllSchemeCodes` (full-universe, gated, empty-safe).
- `apps/web/src/app/api/internal/revalidate/route.test.ts` — +2 security edge-case tests (malformed hex, length mismatch).
- `apps/web/.env.example` / `.env.example` — documented `REVALIDATE_HMAC_SECRET` (+ `REVALIDATE_WEBHOOK_URL` on the API template).

## Tests
- **Web suite: 146/146 pass** (was 136 in Wave 1 + 8 new SEO + 2 new route edge cases).
- New: `sitemap.test.ts` (5) — root+stock+fund URLs, `daily` changeFrequency, lastmod fallback, empty-universe (root-only), `generateSitemaps` shard contract.
- New: `robots.test.ts` (3) — allow/disallow lists, sitemap link, host.
- Strengthened: `route.test.ts` (7 total) — added malformed-hex → 401-no-throw (T-08-14) and truncated/length-mismatch → 401-no-throw.
- Three-layer Gemini ban green (`no-gemini-imports.static.test.ts` now scans the new OG files; CI grep over `app/stock` + `app/fund` returns zero matches).
- `tsc --noEmit`: clean on all files changed/created by this plan (single repo-wide error is the pre-existing `schema-dts` gap — see deferred-items.md).
- ESLint: clean on all new/modified files.

## Task 3 — Plan-contract → shipped-reality mapping (read this before judging Task 3 "skipped")

The plan's Task 3 was written assuming a greenfield API side. Reality: Phase 4 already shipped the **entire** webhook surface under a self-consistent contract, with passing tests on both ends. Building the plan's literal artifacts would have produced dead code and a split-brain contract no sender hits. I conformed and hardened instead.

| Plan artifact / key_link (invented) | Real, shipped equivalent | Location |
|---|---|---|
| `app/api/revalidate/route.ts` (`POST`, `verifySignature(`) | `app/api/internal/revalidate/route.ts` (inlined HMAC + `timingSafeEqual`, fail-closed, 401 no-detail) | apps/web/src/app/api/internal/revalidate/route.ts (Phase 4) |
| `app/lib/revalidate-secret.ts` (`signPayload`/`verifySignature`) | HMAC verify inlined in the route (same primitive: `createHmac('sha256').update(tag)` + `timingSafeEqual`) | route.ts:25-38 |
| `RevalidateWebhookClient.invalidateTags` (NestJS) | `fireRevalidateWebhook` (stock) + fund variant | apps/api/src/reports/reports.service.ts:130, apps/api/src/reports/fund-reports.service.ts:125 |
| header `x-finsight-signature` | header `x-revalidate-hmac` | reports.service.ts:147, route.ts:24 |
| body `{ tags: string[] }` | body `{ tag: string }` (single tag) | reports.service.ts:149, route.ts:5-14 |
| HMAC over raw JSON body | HMAC over the tag string | reports.service.ts:141, route.ts:25 |
| env `REVALIDATE_WEBHOOK_SECRET` / `WEB_BASE_URL` | env `REVALIDATE_HMAC_SECRET` / `REVALIDATE_WEBHOOK_URL` (already in the boot env schema) | apps/api/src/config/env.schema.ts:67-71 |
| eod-recompute calls webhook after each recompute | eod child emits `EOD_TICKER_RECOMPUTED_EVENT` → narrative-batch listener → `bustCache(ticker)` → `fireRevalidateWebhook` | eod-recompute.processor.ts:132, narrative-batch.processor.ts:85 |

All security must-haves still hold against the shipped contract: `crypto.timingSafeEqual` (not `===`), fail-closed when the secret is unset, 401 `{ ok:false }` with no diagnostic detail, length-mismatch returns 401 before `timingSafeEqual` runs. The two edge-case tests I added prove the malformed-hex and length-mismatch paths return 401 without throwing.

## Deviations from Plan

### Auto-fixed / reconciled (no architectural change)

**1. [Rule 3 - Blocking] Task 3 conformed to the already-shipped webhook contract instead of building the plan's duplicate.** Phase 4 shipped sender + receiver + tests + narrative wiring under `/api/internal/revalidate` / `x-revalidate-hmac` / `{tag}` / HMAC-over-tag. Built none of the plan's `/api/revalidate`, `revalidate-secret.ts`, or `RevalidateWebhookClient`. Hardened the existing receiver test with the two security edge cases the plan's behavior list wanted, and documented the env vars. See mapping table above. **Files:** route.test.ts, both .env.example. **Commit:** `0961a91`.

**2. [Rule 3 - Blocking] Added `listAllTickers` / `listAllSchemeCodes`.** The plan's `sitemap.ts` key_link references these (lines 87-90, 196), but only `getTopNTickers`/`getTopNFundSchemeCodes` existed. Added full-universe readers following 08-01's `PUBLIC_INSTRUMENTS_BASE`-gated, returns-`[]` pattern. **File:** instrument-master.ts. **Commit:** `43067a5`.

**3. [Rule 1 - Bug] OG images use the real DTO shape.** The plan's reference used `report.score` (flat) and `report.verdictLabel`; the actual `StockReportDoc`/`FundReportDoc` expose `report.score.value` (number) and `report.score.verdict` (branded enum). Used the real fields and inlined a verdict→label map (Strong Score / Caution / Weak Score) rather than importing the client-side `VerdictBadge` into the edge image render. **Files:** both opengraph-image.tsx. **Commit:** `6269a98`.

**4. [Tooling] Static OG fallback PNG generated via a pure-Node PNG encoder.** `sharp`/`@vercel/og` could not be resolved/invoked from the worktree's symlinked `node_modules` (native-binding `ERR_DLOPEN_FAILED`). Produced a valid 1200×630 branded gradient PNG with a zlib-based encoder. Per-route dynamic OG images carry the text; the static fallback is the brand gradient — acceptable per the plan ("generated placeholder is acceptable; do not block on a designer dependency"). **File:** opengraph-image.png. **Commit:** `6269a98`.

## Verification status (honest)

- **Run & green:** full web vitest suite (146/146), the 8 new SEO unit tests, the 2 new revalidate-route edge cases, the three-layer Gemini ban, `tsc` (on this plan's files), ESLint.
- **NOT run — blocked:** `pnpm build` and the curl HTTP-shape proofs the plan's verify/`<output>` requested for sitemap.xml, robots.txt, and both `/opengraph-image` routes. Blocked by a **pre-existing** gap: `schema-dts@1.1.5` is declared in `apps/web/package.json` (Wave 1) but never installed into `node_modules` — `tsc`/`next build` cannot resolve it, and the worktree's `node_modules` is a symlink to the main checkout (running `pnpm install` would mutate the shared environment and is out of scope). Tracked in `deferred-items.md`. The OG/sitemap/robots code is tsc + lint clean, unit-covered where applicable, and near-verbatim from the documented Next 15 patterns (no custom fonts, explicit `display:flex` on every node — the two real `ImageResponse` footguns are avoided), so code-risk is low — but build/runtime HTTP-shape was not empirically proven this run.

## Known Limitations
- **Webhook fires via the narrative path only.** A normal recompute flows eod → event → narrative-batch → `bustCache` → webhook. The narrative-batch `skipped:'stale-version'` branch and the compliance-violation rethrow branch return before `bustCache`, so those (rare) paths don't invalidate until the next successful narrative write — the 24h ISR floor backstops them. Pre-existing Phase-4 behavior; out of scope for this plan.
- **Sitemap/OG are empty until Phase 2 ships the public instrument endpoint.** `listAll*` and `getTopN*` return `[]` while `PUBLIC_INSTRUMENTS_BASE` is unset; `/sitemap.xml` emits only the root URL (valid). Inherited from 08-01.

## Secret rotation runbook (revalidate webhook)
1. `openssl rand -hex 32` → one 32-byte hex secret.
2. Set the **same** value as `REVALIDATE_HMAC_SECRET` in `apps/web/.env.local` AND the API env (`.env.local` / `REVALIDATE_HMAC_SECRET`). Set `REVALIDATE_WEBHOOK_URL` (API side) to the web origin (e.g. `http://localhost:3000`).
3. Production: mirror via secret manager to both services. Rotate by deploying both with the new value simultaneously. Never commit; never `NEXT_PUBLIC_*`.

## Open questions resolved
- **OG strategy:** per-ticker/per-fund dynamic card (score + verdict) for the cohort with reports, defensive 200 branded fallback for the long tail / fetch failures, plus the root static brand PNG for any layout lacking a co-located image.
- **Hosting:** assumes on-demand-ISR-capable host (Vercel/Netlify/self-hosted `next start`). Static-only hosts fall back to the 24h ISR safety floor.

## Self-Check: PASSED
- FOUND: apps/web/src/app/sitemap.ts
- FOUND: apps/web/src/app/robots.ts
- FOUND: apps/web/src/app/stock/[ticker]/opengraph-image.tsx
- FOUND: apps/web/src/app/fund/[schemeCode]/opengraph-image.tsx
- FOUND: apps/web/src/app/opengraph-image.png (1200x630, 24,690 bytes)
- FOUND commit 43067a5 (sitemap/robots), 6269a98 (OG images), 0961a91 (webhook env+tests), ff015aa (edge runtime)
- Web vitest 146/146 green; tsc clean on plan files; ESLint clean; Gemini ban green.

---
*Phase: 08-public-seo-pages | Plan: 02 | Completed: 2026-06-05*
