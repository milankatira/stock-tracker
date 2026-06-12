---
phase: 09-marketing-landing-page
reviewed: 2026-06-12T00:00:00Z
depth: standard
files_reviewed: 24
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-06-12
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Phase 9 marketing landing page is well-engineered and compliance-aware. SEBI "analysis, not advice" framing is consistently applied and gated by an automated forbid-list test (`copy-compliance.test.tsx`). JSON-LD is rendered XSS-safe (`JSON.stringify(...).replace(/</g, "\\u003c")` over typed/static data — no user input). Security headers in `next.config.ts` are a deliberate set (CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy). The single client-interactive primitive (Accordion) uses native `<button>` with correct `aria-expanded`/`aria-controls` and has keyboard-toggle test coverage.

No Critical issues. One Warning (missing HSTS, cannot confirm Vercel delegation from repo) and four Info items.

## Warnings

### WR-01: Missing Strict-Transport-Security (HSTS) header
**File:** `apps/web/next.config.ts:7-29`
**Issue:** `SECURITY_HEADERS` omits `Strict-Transport-Security`. No `vercel.json` / HSTS reference in repo, so enforcement cannot be confirmed from code. Vercel auto-injects HSTS for prod custom domains, but relying on undocumented platform behavior leaves the policy implicit.
**Fix:** Add the header explicitly, or add a code comment stating HSTS is intentionally delegated to Vercel.
```ts
{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
```

## Info

### IN-01: CSP allows `script-src 'unsafe-inline'`
**File:** `apps/web/next.config.ts:20`
Required by Next.js inline bootstrap + inline JSON-LD blocks — documented tradeoff. If CSP hardening prioritized later, migrate to nonce-based CSP. Add an inline comment noting why `'unsafe-inline'` is present.

### IN-02: `aria-controls` points to a non-rendered panel when collapsed
**File:** `apps/web/src/components/ui/accordion.tsx:117,143-147`
`AccordionContent` returns `null` while collapsed → trigger `aria-controls` references a non-existent id until opened. SR-tolerated, axe does not flag. Optional fix: keep panel mounted, toggle `hidden`.

### IN-03: Borderline advice-adjacent phrasing not catchable by the forbid-list
**File:** `apps/web/src/components/landing/Features.tsx:26-28`
"...verdict you can act on." — soft action-prompting after "No advice." Human-judgment item, not a test failure. Consider softening to "...verdict to inform your own research."

### IN-04: Footer links to route stubs that will 404 until later phases
**File:** `Footer.tsx:29-40`, `Nav.tsx:22,27`, `Hero.tsx:31`
`/about,/blog,/contact,/privacy,/terms,/login,/signup` linked but not yet implemented. Acceptable for v1 (documented). Prioritize `/privacy` + `/terms` stubs before public launch — legal links 404ing on a fintech surface carries regulatory/reputational weight.

---

_Reviewer: gsd-code-reviewer · Depth: standard_
