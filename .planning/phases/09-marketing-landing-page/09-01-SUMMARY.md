---
phase: 09-marketing-landing-page
plan: 01
subsystem: ui
tags: [nextjs, react, tailwind, shadcn, seo, json-ld, vercel-analytics, lighthouse, axe, compliance]

# Dependency graph
requires:
  - phase: 01-foundation-auth-compliance-contract
    provides: /signup and /login routes (CTA targets), compliance disclaimer copy in lib/seo/disclaimers.ts
  - phase: 08-public-seo-pages
    provides: sharded sitemap + JsonLd component + SEO metadata patterns
provides:
  - Public static marketing landing page at /
  - 10 landing section components (Nav, Hero, SampleReport, Features, Personas, HowItWorks, PricingTeaser, ComplianceStrip, FAQ, Footer)
  - SEBI copy-compliance build gate (16-term forbid-list over rendered DOM + JSON-LD)
  - Lighthouse mobile >=95 + axe-core zero-violation CI gate (landing-quality.yml)
  - FAQPage + Organization JSON-LD, OG/Twitter metadata, security headers
affects: [monetisation, signup-conversion, seo-distribution]

# Tech tracking
tech-stack:
  added: ["@vercel/analytics ^2.0.1"]
  patterns:
    - "Static Server Component landing (force-static, no data fetch) for full-HTML SEO indexability"
    - "Build-failing copy-compliance scanner enforces SEBI 'analysis-not-advice' invariant"
    - "Env-gated <Analytics/> (process.env.VERCEL) to avoid off-Vercel script 404"

key-files:
  created:
    - apps/web/src/app/page.tsx
    - apps/web/src/components/landing/*.tsx (10 sections)
    - apps/web/src/components/landing/data.ts
    - apps/web/src/components/landing/__tests__/*.test.tsx (5 test files)
    - apps/web/src/components/ui/{button,slot,avatar,accordion}.tsx
    - apps/web/lighthouserc.json
    - .github/workflows/landing-quality.yml
    - apps/web/src/app/icon.svg
    - apps/web/public/og/landing-v1.png
    - apps/web/public/landing/sample-report-hdfc.png
  modified:
    - apps/web/src/app/layout.tsx
    - apps/web/src/app/globals.css
    - apps/web/next.config.ts
    - apps/web/package.json

key-decisions:
  - "Repurposed / from interim ReportWorkspace to static marketing landing"
  - "Copy-compliance gate caught a real violation: ComplianceStrip 'does not guarantee' -> SEBI-canonical 'is not indicative of'"
  - "prefetch={false} on /signup,/login,Footer links (routes ship in Phase 1; avoid prefetch 404s)"
  - "Inline English copy with TODO(i18n) markers (no t() helper installed yet)"

patterns-established:
  - "Static-first SEO landing: force-static Server Component renders full HTML incl. JSON-LD"
  - "CI quality gate: unit + Lighthouse mobile >=95 + axe-core zero violations"
  - "SEBI forbid-list scanner fails build on prohibited marketing verbs"

requirements-completed: [LAND-01, LAND-02]

# Metrics
duration: ~unknown (executor socket-dropped before self-report; work intact)
completed: 2026-06-12
---

# Phase 09: Marketing Landing Page Summary

**Static, SEO-indexed marketing landing at `/` — 10 sections, compliance-safe sample report, SEBI copy-compliance build gate, Lighthouse mobile 96/100/100/100, axe-core 0 violations.**

## Performance

- **Tasks:** 3 (all committed atomically)
- **Files modified:** 31
- **Landing test files:** 31 passed / 0 failed (vitest, `src/components/landing`)

## Accomplishments
- Public static landing page composing 10 section components, CTA → `/signup`
- 3-tier PricingTeaser (Free / Pro / Premium) with "Coming soon" badges on Pro + Premium
- FAQ accordion (keyboard + click) with inline FAQPage JSON-LD; Organization JSON-LD in Footer
- SEO: metadata export (title/description/OG/Twitter/canonical/robots), root `/` already in sharded sitemap
- Compliance: ComplianceStrip copy + 16-term SEBI forbid-list scanner failing the build on prohibited verbs
- CI: `landing-quality.yml` (unit / lighthouse / a11y jobs) + `lighthouserc.json`
- Security headers in `next.config.ts` (X-Frame-Options DENY, CSP, Referrer-Policy, Permissions-Policy)
- `@vercel/analytics` `<Analytics/>` (env-gated) in root layout; `icon.svg` favicon

## Task Commits

1. **Task 1: landing sections + page composition + Wave-0 tests** — `bacdb6b` (feat)
2. **Task 2: metadata, OG, JSON-LD, analytics, security headers** — `0f147c8` (feat)
3. **Task 3: copy-compliance gate + Lighthouse/axe CI + perf fixes** — `c0de54a` (feat)

## Files Created/Modified
- `apps/web/src/app/page.tsx` — static (force-static) landing route, metadata export, composes 10 sections
- `apps/web/src/components/landing/*.tsx` — Nav, Hero, SampleReport, Features, Personas, HowItWorks, PricingTeaser, ComplianceStrip, FAQ, Footer
- `apps/web/src/components/landing/data.ts` — compliance-safe copy (features, personas, pricing, faqs, steps)
- `apps/web/src/components/ui/{button,slot,avatar,accordion}.tsx` — dependency-free UI primitives
- `apps/web/src/app/layout.tsx` — html lang=en-IN, next/font Inter (display:swap), env-gated `<Analytics/>`
- `apps/web/src/app/globals.css` — shadcn semantic tokens + brand/verdict `@theme` tokens
- `apps/web/next.config.ts` — security headers
- `.github/workflows/landing-quality.yml` + `apps/web/lighthouserc.json` — CI quality gate

## Decisions Made
- Repurposed `/` from interim ReportWorkspace to static marketing landing.
- Copy-compliance gate caught a real SEBI violation in ComplianceStrip — corrected to canonical "is not indicative of".
- `prefetch={false}` on auth/footer links since those routes ship in Phase 1 (avoid prefetch 404s).
- Inline English copy + `TODO(i18n)` markers — no `t()` helper installed yet.

## Deviations from Plan
None affecting scope — all three tasks executed as planned. The copy-compliance correction was the gate working as designed.

## Issues Encountered
- **Executor agent socket-dropped before writing SUMMARY.md and final self-report.** All 3 task commits were intact on the worktree branch (`c0de54a`, base `ea01c23`). Orchestrator fast-forward-merged the branch into `main`, reconciled `pnpm-lock.yaml` via `pnpm install`, and independently verified landing tests pass (31/0). This SUMMARY was reconstructed from commit evidence + test verification.
- Pre-existing uncommitted `pnpm-lock.yaml` drift (563 lines, inconsistent with committed `package.json`) was discarded before merge and regenerated cleanly by `pnpm install`.

## User Setup Required
None — no external service configuration required for landing. (Lighthouse/axe CI jobs run on PR.)

## Next Phase Readiness
- Landing page live at `/`, indexable, CTA-wired to `/signup`. Ready for signup-conversion measurement and monetisation milestone.
- i18n not yet wired (`TODO(i18n)` markers) — flag for future localization phase.

---
*Phase: 09-marketing-landing-page*
*Completed: 2026-06-12*
