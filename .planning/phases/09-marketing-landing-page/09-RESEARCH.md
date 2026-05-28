# Phase 9: Marketing Landing Page - Research

**Researched:** 2026-05-28
**Domain:** Public-facing static marketing landing page (Next.js 15 App Router + shadcn/ui + Tailwind v4)
**Confidence:** HIGH

## Summary

This phase ships a single static, public, fully-responsive landing page at `/` that pitches FinSight AI, shows a compliance-safe sample report, and drives sign-ups into the Phase 1 auth flow. The page is a pure presentation surface — no data fetching, no user state, no auth — which keeps it in the "easy, fast, indexable" bucket: render as a Server Component, force static (`force-static`), inline above-the-fold imagery via `next/image` priority, and rely entirely on the shadcn primitives already in the design system (Card, Button, Badge, Accordion, Tabs, Tooltip, Avatar, Separator). Tailwind v4's CSS-first `@theme` directive holds all the design tokens; no `tailwind.config.js` is created.

The two real risks are non-technical: (1) **compliance copy** — the marketing surface is where over-promising language ("best stocks", "guaranteed returns", "buy now") most easily creeps in, and (2) **scope creep** — landing pages tempt feature work that isn't in v1 (animations, A/B testing, video). Mitigation: a fixed copy lint list (the verdict-vocabulary enum from COMP-01 extends to marketing), the "Coming soon" badge for any V2 feature mentioned, and an explicit Out-of-Scope list (carousels, hero animation, video bg, A/B framework) carried into PLAN.md.

**Primary recommendation:** Single Server Component at `apps/web/src/app/page.tsx`, composed of ~10 section components under `apps/web/src/components/landing/`. shadcn primitives via CLI (`pnpm dlx shadcn@latest add ...`), Tailwind v4 `@theme` in `globals.css`, `next/image` with `priority` on hero, `next/font` with `display: 'swap'` for fonts. Analytics: Vercel Analytics by default (one-line install, privacy-respecting, free tier) — defer Plausible/PostHog to a later phase. Verify with Lighthouse CI mobile ≥ 95 and axe-core accessibility audit.

## User Constraints (from CONTEXT.md / locked decisions)

### Locked Decisions
- **Stack:** Next.js 15 App Router + shadcn/ui + Tailwind v4. **No alternatives explored.**
- **Page type:** Static, no auth, no data fetching. Links to Phase 1 sign-up flow.
- **Tailwind v4 CSS-first:** Use `@theme` directive — no `tailwind.config.js`.
- **A/B test scaffold:** OUT OF SCOPE for v1.

### Claude's Discretion
- Analytics vendor (Plausible / Vercel Analytics / PostHog) — recommend a privacy-respecting default; defer final pick to user.
- Specific section ordering inside the page (within the locked section list).
- Whether to ship a static SVG hero illustration vs. a screenshot of a sample report card.

### Deferred Ideas (OUT OF SCOPE)
- Carousels, hero video, complex scroll animations.
- A/B testing framework.
- Multi-language copy (LANG-01 is V2).
- Live data on the landing page (sample report is hand-authored static JSON, not a Mongo read).
- Pricing checkout / Razorpay (deferred to monetisation milestone).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **LAND-01** | A public landing page communicates the value prop, a pricing teaser, and a CTA to sign up | Section list in `## Architecture Patterns` covers hero + value prop + pricing teaser + CTA → `/signup` route established by Phase 1 (AUTH-01). Compliance-safe copy template under `## Common Pitfalls > Compliance Vocabulary Creep`. |
| **LAND-02** | The landing page is fully responsive across mobile and desktop | Tailwind v4 mobile-first breakpoints in `## Architecture Patterns > Responsive Design`. Lighthouse mobile + desktop runs in `## Validation Architecture` enforce ≥ 95 score on both. Min 44px tap targets per Apple/WCAG guidance. |

## Project Constraints (from CLAUDE.md)

The user's global + project CLAUDE.md enforces these directives that this phase must comply with:

- **No hardcoded strings (frontend/no-hardcoded-strings):** All user-facing copy goes through `$t()` / `t()` i18n helpers. The landing copy is the single largest English-string surface in v1 — wire i18n keys from the start even though only `en` is shipped. (Defer if Phase 1 hasn't installed the i18n library; document the deferral in PLAN.md.)
- **Use shadcn HL components (frontend/highrise-components):** No raw HTML where an HL component exists. For this project the equivalent is **shadcn/ui components** — use `<Card>`, `<Button>`, `<Accordion>` etc., never hand-rolled equivalents.
- **No `any`, handle every error, test file per source file (universal/*):** Each section component (`Hero.tsx`, `Features.tsx`, etc.) gets a paired test file (`Hero.test.tsx`) asserting observable behavior (CTA link target, accordion expand, mobile-stack class presence). Behavior-first, not snapshot.
- **No hardcoded secrets:** Analytics IDs / domain go via `NEXT_PUBLIC_*` env, not inline.
- **Composition API, `<script setup>`:** N/A — this is React, not Vue. The project is Next.js per locked stack, so the Vue-specific rules don't apply.
- **80% test coverage minimum** (rules/common/testing.md).
- **WCAG AA contrast** and **focus rings** (rules/common/security.md indirectly + a11y best practice).

## Standard Stack

### Core (already locked from Phase 1)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `15.5.18` | Static page + RSC + routing | Locked by user. `15.5.x` is the latest 15 minor; 16.2.6 exists but is outside the lock. [VERIFIED: npm registry, 2026-05-28] |
| `react` | `19.2.x` | UI runtime | Required by Next 15.5. [VERIFIED: STACK.md] |
| `tailwindcss` | `4.3.0` | Styling | Locked by user. CSS-first `@theme` directive. [VERIFIED: npm registry, 2026-05-28] |
| shadcn/ui | CLI `latest` | Component primitives (Card, Button, Accordion, Tabs, etc.) | Locked. Source-copied into repo via CLI; no runtime dep. [CITED: ui.shadcn.com/docs/installation/next] |
| `lucide-react` | `1.16.0` | Icons (used by shadcn by default) | shadcn defaults to lucide; ships with `pnpm dlx shadcn add`. [VERIFIED: npm registry, 2026-05-28] |

### Supporting (new for this phase)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vercel/analytics` | `2.0.1` | Privacy-respecting pageview + CTA event analytics | Default recommendation if hosting on Vercel — one-line `<Analytics />` in root layout, no cookies, GDPR/DPDP-friendly. [VERIFIED: npm registry, 2026-05-28] |
| `next/image` (built-in) | n/a | Automatic AVIF/WebP, lazy-load, responsive `srcset` | All raster images on the page. `priority` on hero only. [CITED: nextjs.org/docs/app/api-reference/components/image] |
| `next/font` (built-in) | n/a | Self-hosted Google Fonts with `display: 'swap'`, zero CLS | Load Inter (or chosen font) once in `app/layout.tsx`. [CITED: nextjs.org/docs/app/api-reference/components/font] |
| `react-wrap-balancer` | `1.1.1` | Balance multi-line headings on hero / section titles | Optional UX polish for hero headline — keep it crisp on every breakpoint. [VERIFIED: npm registry, 2026-05-28] [ASSUMED useful here — skip if it adds noticeable JS] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@vercel/analytics` (default) | `plausible-tracker` `0.3.9` | Plausible is fully self-hosted-able, EU-based, slightly more privacy-strong; pay-per-month after free trial. Use if non-Vercel hosting or stronger privacy stance. [VERIFIED: npm registry, 2026-05-28] |
| `@vercel/analytics` | `posthog-js` `1.376.3` | PostHog adds session replay + feature flags — overkill for v1 landing, useful once retention experiments start. Defer. [VERIFIED: npm registry, 2026-05-28] |
| shadcn `Accordion` (Radix-based) | Build from `<details>`/`<summary>` | Native `<details>` is zero-JS but harder to style + lacks ARIA polish. shadcn already in design system — use it. |
| Custom hero gradient | Tailwind `bg-gradient-*` utilities + a static `next/image` AVIF | Tailwind utility class is zero-bytes-extra; image lets a designer art-direct. Use utility for v1. |
| `embla-carousel-react` | none — no carousel | Carousels harm conversion + LCP; skip entirely. Section "Personas" uses a CSS grid, not a carousel. |

**Installation:**

```bash
# In apps/web (Next.js 15 already scaffolded in Phase 1)
cd apps/web

# shadcn primitives (idempotent — only adds missing ones)
pnpm dlx shadcn@latest add card button badge accordion tabs tooltip avatar separator

# Analytics (default)
pnpm add @vercel/analytics

# Optional polish
pnpm add react-wrap-balancer
```

**Version verification (2026-05-28, npm registry):**
- `next` latest 15.5: `15.5.18` (15.5.13 → 15.5.18 are recent patches). 16.2.6 exists; do not adopt — locked to 15.
- `tailwindcss`: `4.3.0`
- `@vercel/analytics`: `2.0.1`
- `lucide-react`: `1.16.0`
- `react-wrap-balancer`: `1.1.1`
- `plausible-tracker`: `0.3.9` (alt)
- `posthog-js`: `1.376.3` (alt)

## Architecture Patterns

### Recommended Project Structure

```
apps/web/
└── src/
    ├── app/
    │   ├── page.tsx                  # Landing route — Server Component, force-static
    │   ├── layout.tsx                # Root layout (already exists from Phase 1)
    │   └── globals.css               # Tailwind v4 @import + @theme tokens
    └── components/
        └── landing/
            ├── Hero.tsx              # Headline, sub-headline, CTA, sample card preview
            ├── SampleReport.tsx      # Static FinSight Score card (compliance-safe)
            ├── Features.tsx          # 6-card grid
            ├── Personas.tsx          # Rahul / Priya / Amit / Mrs. Kulkarni
            ├── HowItWorks.tsx        # 3-step diagram (Search → Score → Decide)
            ├── PricingTeaser.tsx     # Free / Pro / Premium cards
            ├── ComplianceStrip.tsx   # "Analysis, not advice." trust block
            ├── FAQ.tsx               # shadcn Accordion, 6–8 Q&A
            ├── Footer.tsx            # Links, social, SEBI note
            ├── Nav.tsx               # Logo + Login + Sign Up
            └── __tests__/            # one .test.tsx per section
```

### Section Order (top → bottom)

1. **`<Nav>`** — Sticky on scroll. Logo left, Login + Sign Up buttons right.
2. **`<Hero>`** — Headline ("Plain-English score, verdict, and reasoning for any Indian stock or mutual fund — in under 2 seconds."), sub-headline, primary CTA ("Get Started — Free"), sub-CTA ("See sample report" → anchors to `#sample`). Inline static `<SampleReport>` to the right on desktop / below on mobile.
3. **`<Features>`** — 6 cards: Score & Verdict | Six Insight Cards | Stocks + Mutual Funds | Ask FinSight Chat | News + Sentiment | SEO Research Pages. Each card = shadcn `Card` + icon + 2-line description.
4. **`<Personas>`** — 4 avatar blocks. Use shadcn `Avatar` (with initials/illustration) + name + one-line pain point.
5. **`<HowItWorks>`** — 3 numbered steps with arrows on desktop, stacked on mobile. **Copy:** "Search → Score → Decide for yourself" (note the wording — "decide for yourself" reinforces non-advice posture).
6. **`<PricingTeaser>`** — 3 shadcn `Card`s: Free / Pro / Premium. Pro + Premium get a "Coming soon" Badge — the only honest framing pre-monetisation.
7. **`<ComplianceStrip>`** — Full-width section: "Analysis, not advice. Data from NSE, BSE, AMFI. Past performance does not guarantee future results."
8. **`<FAQ>`** — shadcn `Accordion` with 6–8 items (see "FAQ candidate questions" below).
9. **`<Footer>`** — 4 columns: Product / Company / Legal / Contact. Privacy Policy, Terms, SEBI note, social links.

### Pattern 1: Static Server Component (force-static)

**What:** The page is a pure React Server Component with `dynamic = 'force-static'` so Next.js generates it at build time and serves it from the CDN edge with zero runtime cost.

**When to use:** Any page with no per-user data, no auth state, no server-side personalisation.

**Example:**

```tsx
// Source: nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
// apps/web/src/app/page.tsx
import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
// ...other sections

export const dynamic = 'force-static';
export const revalidate = false; // build-time only; redeploy to update

export const metadata: Metadata = {
  title: 'FinSight AI — AI-powered stock & mutual fund analysis for India',
  description:
    'Plain-English score, verdict, and reasoning for any Indian stock or mutual fund — in under 2 seconds. Analysis, not advice.',
  openGraph: {
    title: 'FinSight AI',
    description:
      'Plain-English score, verdict, and reasoning for any Indian stock or mutual fund.',
    type: 'website',
    locale: 'en_IN',
    images: ['/og/landing-v1.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FinSight AI',
    description:
      'Plain-English score, verdict, and reasoning for any Indian stock or mutual fund.',
    images: ['/og/landing-v1.png'],
  },
  alternates: { canonical: 'https://finsight.ai/' },
};

export default function LandingPage() {
  return (
    <main>
      <Nav />
      <Hero />
      <Features />
      {/* … */}
    </main>
  );
}
```

### Pattern 2: Tailwind v4 CSS-First Theme

**What:** All design tokens (colors, spacing, font families, breakpoints, radii) live in `@theme` blocks inside `globals.css`. No `tailwind.config.js`.

**When to use:** Always, for any styling token in this codebase (locked by user directive).

**Example:**

```css
/* Source: tailwindcss.com/docs/v4-beta + ui.shadcn.com/docs/tailwind-v4 */
/* apps/web/src/app/globals.css */
@import "tailwindcss";

@theme {
  --color-brand-50:  oklch(0.97 0.02 250);
  --color-brand-500: oklch(0.55 0.18 250);
  --color-brand-700: oklch(0.42 0.20 250);
  --color-verdict-strong:  oklch(0.65 0.18 145);
  --color-verdict-caution: oklch(0.78 0.15 75);
  --color-verdict-weak:    oklch(0.60 0.20 25);

  --font-display: "Inter", system-ui, sans-serif;
  --font-body:    "Inter", system-ui, sans-serif;

  --radius-card: 1rem;
}

/* Optional: dark-mode tokens via @media or .dark class */
@media (prefers-color-scheme: dark) {
  @theme {
    --color-brand-50: oklch(0.20 0.02 250);
    /* … */
  }
}
```

### Pattern 3: Mobile-First Responsive Grids

**What:** Default styling = mobile (single column). Add `sm:`, `md:`, `lg:` prefixes to step up.

**When to use:** Every layout — Tailwind v4 breakpoints are mobile-first by default.

**Example:**

```tsx
// Source: tailwindcss.com/docs/responsive-design
// Features grid: 1 col mobile → 2 col tablet → 3 col desktop
<section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
    {features.map((f) => (
      <FeatureCard key={f.id} {...f} />
    ))}
  </div>
</section>
```

**Tailwind v4 default breakpoints:** `sm: 40rem`, `md: 48rem`, `lg: 64rem`, `xl: 80rem`, `2xl: 96rem`. Stay with defaults; do not redefine unless required.

**Tap target rule:** Every interactive element ≥ 44×44 px (`h-11 w-11` minimum or `px-4 py-3` on buttons). [CITED: Apple HIG + W3C WCAG 2.5.5]

### Pattern 4: Hero Image with `priority` + Explicit Dimensions

**What:** Use `next/image` for any raster. The single above-the-fold image (hero illustration or sample report screenshot) gets `priority` so it preloads; all other images stay lazy.

**Example:**

```tsx
// Source: nextjs.org/docs/app/api-reference/components/image
import Image from 'next/image';

<Image
  src="/landing/sample-report.png"
  alt="FinSight AI sample report for HDFC Bank showing the FinSight Score of 7 out of 10"
  width={640}
  height={420}
  priority
  sizes="(max-width: 768px) 100vw, 640px"
  className="rounded-2xl shadow-xl"
/>
```

**Notes:**
- Always supply explicit `width`/`height` or `fill` + sized parent — prevents CLS.
- Next.js outputs AVIF + WebP automatically; no manual conversion.
- `alt` text must describe the *information* the image conveys, not "image of …".

### Pattern 5: Font Loading via `next/font`

**What:** Self-host the font; no external request; `display: 'swap'` so text paints immediately.

**Example:**

```tsx
// Source: nextjs.org/docs/app/api-reference/components/font
// apps/web/src/app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

### Anti-Patterns to Avoid

- **Client-side data fetching on the landing page.** No `useEffect` + `fetch` to populate sections — that destroys LCP and adds runtime cost for zero benefit. Hand-author sample data as a TS constant.
- **Hero `<video autoPlay>` background.** Kills LCP, blows mobile data, fails on iOS without `muted playsInline`. Skip entirely.
- **Carousels for the personas/features sections.** Horizontal scrollers cap conversion (Nielsen Norman) and add JS weight. Use a grid.
- **Modal sign-up / paywall.** Reduces conversion vs. a button that navigates to the dedicated `/signup` route. CTA → real route, always.
- **Tailwind v3 `tailwind.config.js`.** Locked to v4 CSS-first; any contributor who creates one violates the lock.
- **Marketing copy outside the `t()` translation layer.** Even if only `en` ships, wire keys now so V2 multi-language doesn't rewrite every section.
- **Loading the entire shadcn library.** Only `pnpm dlx shadcn add` the components you actually render; each is source-copied, so unused ones are dead weight.
- **Dynamic favicons / animated SVG hero shapes.** Adds JS for negligible UX gain.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accordion / disclosure widget | Custom `useState` toggle + manual ARIA | shadcn `Accordion` (Radix `Accordion.Root`) | Keyboard navigation, `aria-expanded`, `aria-controls`, focus management, animations — all already handled by Radix primitives. [CITED: radix-ui.com/primitives/docs/components/accordion] |
| Tabbed stock/fund switch in sample report | Custom tab pattern | shadcn `Tabs` (Radix `Tabs.Root`) | Same a11y story — arrow-key nav, roving tabindex, ARIA tab roles. |
| Image format conversion / responsive `srcset` | Hand-written `<picture>` + AVIF + WebP pipeline | `next/image` | Auto AVIF/WebP, lazy-load, blur placeholder, deviceSizes-driven `srcset`. [CITED: nextjs.org/docs/app/api-reference/components/image] |
| Font loading / FOUT prevention | `<link rel="preload">` + CSS `@font-face` | `next/font` | Self-hosts, eliminates Google request, `display: 'swap'`, zero CLS. [CITED: nextjs.org/docs/app/api-reference/components/font] |
| Tooltip on feature card | Custom `position: absolute` + JS | shadcn `Tooltip` (Radix) | Positioning collisions, `aria-describedby`, dismiss on Esc. |
| OG image generation | Manual PNG export + `<meta>` | Static PNG in `/public/og/` for v1; `@vercel/og` only if dynamic per-route OGs needed later | Single landing OG doesn't need dynamic generation. |
| Theme system / dark mode | Manual CSS class toggles + localStorage | `next-themes` if dark mode ships (defer to next phase) | Hydration-safe, system-pref aware. Defer — v1 ships light-only unless brand spec says otherwise. |
| Analytics + cookie banner | Custom script tag + consent dialog | `@vercel/analytics` (cookieless by default) | Skips DPDP consent burden for v1; no PII; no cookies. [CITED: vercel.com/docs/analytics/privacy-policy] |
| FAQ schema markup | Hand-write JSON-LD per page change | A single `FAQPage` JSON-LD `<script>` rendered from the same data array as the `<FAQ>` component | One source of truth — the array drives both. |
| Form / sign-up | Build a form on the landing page | CTA `<a href="/signup">` → Phase 1 sign-up flow | No PII collected on landing; bounce is to the real route. |

**Key insight:** Marketing pages are deceptively easy. Every "small custom thing" (the accordion, the tab, the tooltip) hides ~50 lines of a11y and edge-case code that Radix/shadcn already solved. Use the primitives. Build only the layout + copy.

## Common Pitfalls

### Pitfall 1: Compliance Vocabulary Creep

**What goes wrong:** Marketing copy slips in SEBI-prohibited verbs ("best stocks", "guaranteed returns", "buy now", "we recommend"), echoing growth-marketing instincts.

**Why it happens:** Marketing language conventions reward urgency + certainty; SEBI compliance requires the opposite — analysis-only framing.

**How to avoid:**
- Reuse the `Verdict` enum mindset: there is a **fixed allowlist** of action verbs the page may use (`Get started`, `Try free`, `See sample`, `Learn more`, `Sign up`).
- Forbid-list the following anywhere in `apps/web/src/components/landing/**`: `buy`, `sell`, `hold`, `recommend`, `guaranteed`, `risk-free`, `best stocks`, `top picks`, `target price`, `multibagger`.
- Add a copy-lint task: a Jest test that scans rendered text against the forbid-list and fails the build on hit.
- All claim numbers go through a footnoted disclaimer ("Past performance does not guarantee future results.").

**Warning signs:** A growth/marketing teammate edits copy directly; rephrasing creeps in via "test variants"; PR diffs that touch landing copy without disclaimer updates.

### Pitfall 2: Over-Promising V2 Features

**What goes wrong:** Landing markets Portfolio Sync, Smart Alerts, IPO verdicts, or AI Screener — features that aren't in v1.

**Why it happens:** Roadmap docs (PRD V2 / V3) get scraped for "feature lists" by whoever writes copy.

**How to avoid:**
- Cross-reference every feature mention against REQUIREMENTS.md `v1 Requirements`.
- Tag any V2-adjacent capability with a `<Badge>Coming soon</Badge>` shadcn badge — no exceptions.
- Pricing teaser Free/Pro/Premium: only **Free** is fully clickable. Pro/Premium = `Coming soon` badge + grayed CTA.

**Warning signs:** Copy refers to "your portfolio", "real-time alerts", "IPO recommendations", "Hindi reports" — all are V2.

### Pitfall 3: Heavy Hero Animations Hurting LCP

**What goes wrong:** Lottie animation, animated gradient mesh, full-bleed video, or canvas-based hero illustrations push LCP > 2.5s.

**Why it happens:** "Hero animation" is the most common designer ask for landing pages.

**How to avoid:**
- Hero is a **static** image (next/image `priority`) or a **CSS-only** gradient + text. Nothing else.
- If motion is unavoidable, use `prefers-reduced-motion` to disable it for ~30% of users who set the OS pref.
- Lighthouse mobile LCP must be < 2.5s, validated in CI.

**Warning signs:** New JS dependency added to the landing page; Lighthouse LCP drops below 2.5s.

### Pitfall 4: CLS from Late-Loaded Fonts / Images

**What goes wrong:** Cumulative Layout Shift exceeds 0.1 because images don't have explicit dimensions or the font swaps from fallback to web font and the heading height changes.

**Why it happens:** Forgetting `width`/`height` on `<img>`; loading Google Fonts via `<link>` instead of `next/font`.

**How to avoid:**
- **Every** image (`next/image`) declares `width`+`height` or `fill` with sized parent.
- **Every** font loaded via `next/font` with `display: 'swap'`, and `adjustFontFallback: true` (default) so the fallback metrics match the web font.
- Test CLS = 0 in Lighthouse mobile run.

**Warning signs:** Lighthouse warns "Avoid large layout shifts"; visual jump on first paint.

### Pitfall 5: Forgetting Mobile Tap-Target Size

**What goes wrong:** CTAs are < 44px tall on mobile, causing mis-taps and accessibility audit failures.

**Why it happens:** Designer mocks at desktop sizes, copy-paste to mobile.

**How to avoid:**
- Every interactive element: `min-h-11` (44px) on mobile; `py-3` on inline links.
- Run axe-core or Lighthouse a11y audit which catches this automatically.

**Warning signs:** Lighthouse accessibility score < 95; user report of mis-taps.

### Pitfall 6: SEO Tag Drift on Production Domain

**What goes wrong:** Canonical URL points to `localhost:3000` or staging; OG image returns 404 on production.

**Why it happens:** Hard-coded URLs in `generateMetadata`; OG asset under wrong path.

**How to avoid:**
- Use `process.env.NEXT_PUBLIC_SITE_URL` for canonical/OG URLs.
- Place OG image at `apps/web/public/og/landing-v1.png` (Next serves `/og/landing-v1.png` automatically).
- Manual smoke after deploy: `curl https://finsight.ai/` and verify `<link rel="canonical">` + `<meta property="og:image">` resolve.

**Warning signs:** Slack/WhatsApp share preview is broken; Google Search Console reports canonical mismatch.

### Pitfall 7: Analytics Blocking the Render

**What goes wrong:** Synchronous analytics script delays first-paint; or a third-party script (Hotjar, FullStory) injects > 100KB on landing.

**Why it happens:** Marketing team wants "all the tools".

**How to avoid:**
- Use Vercel Analytics (or equivalent) — single ~5KB script, loaded `async`.
- Reject any analytics that isn't truly cookieless or that adds session-replay.
- Add to PLAN.md: "any future analytics addition needs a perf budget review."

**Warning signs:** Lighthouse "Reduce unused JavaScript" warning citing analytics origin; LCP regression after deploy.

### Pitfall 8: Forgetting Indian Locale Specifics

**What goes wrong:** Currency / number formatting inconsistent (USD `$` instead of `₹`; "1,000,000" instead of "10,00,000" Indian comma grouping).

**Why it happens:** Default JS locale.

**How to avoid:**
- `<html lang="en-IN">` in root layout.
- Sample report numbers hand-formatted with Indian grouping or `Intl.NumberFormat('en-IN', { ... })`.
- Pricing in `₹` (rupees), not `$`.

**Warning signs:** First user from Mumbai screenshots "$" pricing.

## Code Examples

Verified patterns from official sources.

### Hero Section (full)

```tsx
// apps/web/src/components/landing/Hero.tsx
// Source: shadcn/ui card + button patterns; nextjs.org/docs Image + Link
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-brand-50 to-background">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
        <div className="text-center lg:text-left">
          <Badge variant="secondary" className="mb-4">
            Analysis, not advice
          </Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Plain-English score, verdict, and reasoning for any Indian stock or
            mutual fund — in under 2 seconds.
          </h1>
          <p className="mt-6 text-pretty text-lg text-muted-foreground sm:text-xl">
            FinSight AI distills NSE, BSE, and AMFI data into a single 1–10
            score with a worded verdict, six insight cards, and a
            conversational AI you can ask "why?".
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
            <Button asChild size="lg" className="min-h-11 w-full sm:w-auto">
              <Link href="/signup">Get started — free</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-h-11 w-full sm:w-auto">
              <Link href="#sample">See sample report</Link>
            </Button>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <Image
            src="/landing/sample-report-hdfc.png"
            alt="FinSight AI sample report for HDFC Bank showing FinSight Score 7 out of 10 with a Strong Score verdict"
            width={640}
            height={520}
            priority
            sizes="(max-width: 1024px) 100vw, 640px"
            className="rounded-2xl border shadow-2xl"
          />
        </div>
      </div>
    </section>
  );
}
```

### Features Grid (responsive 1 → 2 → 3 columns)

```tsx
// apps/web/src/components/landing/Features.tsx
// Source: shadcn Card + lucide icons
import {
  Gauge, LayoutGrid, LineChart, MessagesSquare, Newspaper, Search,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const features = [
  { icon: Gauge,         title: 'FinSight Score & Verdict',  body: 'A deterministic 1–10 score with a worded verdict — Strong, Caution, or Weak — for every stock and fund.' },
  { icon: LayoutGrid,    title: 'Six Insight Cards',         body: 'Score, Volatility, Profit Consistency, Event Sensitivity, SWOT, and Promoter Holdings — at a glance.' },
  { icon: LineChart,     title: 'Stocks + Mutual Funds',     body: 'One framework for both. Compare a fund against its category and benchmark in seconds.' },
  { icon: MessagesSquare,title: 'Ask FinSight Chat',         body: 'A conversational AI grounded in real data. It never makes up numbers.' },
  { icon: Newspaper,     title: 'News + Sentiment',          body: 'Latest headlines per stock with AI-tagged sentiment, feeding the live score.' },
  { icon: Search,        title: 'SEO Research Pages',        body: 'A public, indexable page per stock and per fund — research before you sign up.' },
] as const;

export function Features() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8" aria-labelledby="features-heading">
      <h2 id="features-heading" className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl">
        Everything you need to research, in one screen
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
        No data dumps. No advice. Just an opinionated, compliance-safe verdict you can act on.
      </p>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="h-full">
            <CardHeader>
              <Icon className="h-8 w-8 text-brand-500" aria-hidden="true" />
              <CardTitle className="mt-4">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{body}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
```

### FAQ Accordion (with FAQPage JSON-LD)

```tsx
// apps/web/src/components/landing/FAQ.tsx
// Source: ui.shadcn.com/docs/components/accordion + schema.org/FAQPage
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';

const faqs = [
  { q: 'What is the FinSight Score?',           a: 'A deterministic 1–10 score computed from six weighted pillars (Fundamentals, Valuation, Technical, Sentiment, Risk, Event Sensitivity). The score is data-driven; the AI only writes the explanation.' },
  { q: 'Is this investment advice?',            a: 'No. FinSight AI provides analysis, not advice. We are not a SEBI-registered Research Analyst. Use this to inform your own research and decisions.' },
  { q: 'Where does the data come from?',        a: 'Public sources — NSE, BSE, AMFI, and licensed news feeds. Prices are 15-minute delayed for stocks.' },
  { q: 'Do you cover mutual funds?',            a: 'Yes — every AMFI-listed scheme gets a Fund Score, returns vs benchmark, risk metrics, and peer comparison.' },
  { q: 'How is the AI prevented from making things up?', a: 'Numbers are computed by deterministic code, then handed to the AI as inputs. The AI only writes narrative prose; every number it mentions is audited before reaching you.' },
  { q: 'Is it free?',                           a: 'Yes — core access is free. Pro and Premium tiers are coming soon.' },
  { q: 'When are alerts and portfolio sync coming?', a: 'Smart alerts and broker portfolio sync are on the roadmap for a future release.' },
] as const;

export function FAQ() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl">
        Frequently asked questions
      </h2>
      <Accordion type="single" collapsible className="mt-10 w-full">
        {faqs.map(({ q, a }, i) => (
          <AccordionItem key={q} value={`item-${i}`}>
            <AccordionTrigger className="min-h-11 text-left">{q}</AccordionTrigger>
            <AccordionContent>{a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- static JSON-LD, no user input
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </section>
  );
}
```

### Organization JSON-LD (in root layout or Footer)

```tsx
// apps/web/src/components/landing/Footer.tsx (excerpt)
// Source: schema.org/Organization + Google Search Central
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'FinSight AI',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://finsight.ai',
  logo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://finsight.ai'}/logo.png`,
  description:
    'AI-powered investment analysis for Indian stocks and mutual funds. Analysis, not advice.',
  sameAs: [
    'https://twitter.com/finsight_ai',
    'https://www.linkedin.com/company/finsight-ai',
  ],
};
// Render: <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
```

### Vercel Analytics (one-liner in root layout)

```tsx
// apps/web/src/app/layout.tsx (excerpt)
// Source: vercel.com/docs/analytics/quickstart
import { Analytics } from '@vercel/analytics/next';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

CTA-click tracking (optional, custom event):

```tsx
// In Hero.tsx, on the primary CTA
import { track } from '@vercel/analytics';

<Button asChild onClick={() => track('landing_cta_signup_clicked')}>
  <Link href="/signup">Get started — free</Link>
</Button>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` (Tailwind v3) | Tailwind v4 CSS-first `@theme` directive | Tailwind v4.0 (Jan 2025) → v4.3 (current) | All tokens in CSS; no JS config file. Locked by user directive. |
| `<link rel="preload" href="/_next/static/...">` for fonts | `next/font` (auto-self-host) | Next 13 (2022) | Zero CLS, no Google CDN request. |
| Pages Router `pages/index.tsx` | App Router `app/page.tsx` (RSC) | Next 13 → default in Next 14+ | Server Components by default. |
| `next/legacy/image` | `next/image` (new defaults, auto AVIF) | Next 13 → only option in Next 15 | Implicit `srcset`, smaller bytes. |
| Hand-rolled accordion + ARIA | Radix primitives via shadcn `Accordion` | shadcn 2023+ | Solved a11y, keyboard nav, animations. |
| `text-embedding-004` for any embedding-related landing widget | (none on landing — but if you ever vectorize landing copy) `gemini-embedding-001` @ 768 dims | Jan 14 2026 sunset | Don't reach for legacy. |

**Deprecated/outdated:**
- **Tailwind v3 setup** (`tailwind.config.js`-centric). Don't introduce in this project.
- **Pages Router** for any new page in this app.
- **Synchronous Google Fonts `<link>`** — use `next/font`.
- **`@next/font`** (the standalone package) — folded into `next/font` since Next 13.2.
- **Custom carousels for marketing.** Best-practice has moved away from carousels on landings.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `react-wrap-balancer` improves hero rendering enough to justify the dep | Standard Stack > Supporting | Tiny — drop it; Tailwind `text-balance` covers most cases in modern browsers. |
| A2 | Hosting will be on Vercel (justifies default `@vercel/analytics`) | Standard Stack > Supporting | If self-hosted/non-Vercel, swap to Plausible (`0.3.9`). Trivial change. |
| A3 | i18n library will be in place by the time landing ships (so `t()` keys are wirable) | Project Constraints | If not, ship inline `en` strings tagged with a TODO; defer i18n to a later phase. |
| A4 | Brand colors / typography spec exists (or Claude chooses defaults: Inter + neutral palette + brand accent in oklch blue) | Architecture Patterns > Pattern 2 | Designer feedback may rework tokens; confined to one `@theme` block. |
| A5 | Sample report data (HDFC Bank example) is hand-authored static — not pulled from Phase 4's materialised store | Architecture Patterns > Pattern 1 | Acceptable per "no data fetching" lock; if user wants real data, becomes a Phase 8-dependent task instead. |
| A6 | Light mode only for v1; dark mode deferred | Don't Hand-Roll > theme | If user wants dark on launch, add `next-themes` + `.dark` `@theme` overrides — ~30 mins. |
| A7 | OG image is a single static `landing-v1.png` in `/public/og/`, hand-designed | Code Examples > Hero | If dynamic OG required, add `@vercel/og` (~20 mins). |
| A8 | Lighthouse target ≥ 95 mobile is reachable on this section list | Validation Architecture | If perf budget needs adjustment, hero image is the variable to tune. |
| A9 | The verdict-vocabulary forbid-list (`buy`, `sell`, `hold`, etc.) is canonical for marketing copy | Common Pitfalls > Pitfall 1 | If SEBI/legal review adds more terms, extend the array — no architecture change. |
| A10 | Pricing tiers Free / Pro / Premium reflect PRD intent (Pro + Premium = `Coming soon`) | Architecture Patterns > Section Order | If pricing structure changes, update `PricingTeaser.tsx` data — copy-only. |

**Confirmation recommended before locking PLAN.md:** A2 (analytics vendor), A4 (brand tokens), A6 (dark mode), A10 (pricing tiers).

## Open Questions

1. **Analytics vendor: Vercel vs. Plausible vs. PostHog?**
   - What we know: All three are cookieless or near-cookieless. Vercel is one-line if hosted on Vercel.
   - What's unclear: Hosting target (Vercel / Render / self-hosted) and how much the team values self-hostability.
   - Recommendation: Default to `@vercel/analytics` for v1; revisit at scale.

2. **Brand tokens (colors, font, logo)?**
   - What we know: Visual identity isn't yet specified in PROJECT.md.
   - What's unclear: Designer-supplied palette, logo asset, font choice.
   - Recommendation: Use Inter + neutral grays + an oklch blue brand accent as placeholders. Centralise in `@theme` so a rebrand is a single-file change.

3. **Sample report data — HDFC Bank, or aggregate "demo"?**
   - What we know: Static hand-authored. PRD doesn't pick a sample.
   - What's unclear: Does using a real company name imply endorsement?
   - Recommendation: Use HDFC Bank (most recognized large-cap) with an explicit "Sample report — for illustration only" caption. Compliance interceptor doesn't apply (no AI was used).

4. **Dark mode for v1?**
   - What we know: Default light theme is universal for marketing pages.
   - What's unclear: User preference.
   - Recommendation: Light only for v1. Add dark mode in a polish phase.

5. **Cookie banner / DPDP consent on landing?**
   - What we know: Vercel Analytics is cookieless by design. No PII collected on the landing surface.
   - What's unclear: Whether legal counsel still wants a "Privacy Policy" link in the footer (yes — always).
   - Recommendation: Footer link to `/privacy`; no banner required while cookieless.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js build + dev | ✓ | v24.14.0 | — (Next 15.5 requires ≥ 18.18; we're well above) |
| pnpm | Monorepo workspace + shadcn CLI | ✓ | 10.28.2 / 11.4.0 (via npx) | npm or yarn — pnpm is project-standard |
| npx | One-shot shadcn / lighthouse runs | ✓ | 10.9.7 | — |
| Next.js 15.5 | All page rendering | Installed in Phase 1 | 15.5.18 (npm latest) | — |
| Tailwind v4 | All styling | Installed in Phase 1 | 4.3.0 | — |
| shadcn CLI | Component install | Available via `pnpm dlx shadcn@latest` | latest | — |
| Chrome / Chromium | Lighthouse CI runs | ✗ (no `/Applications/Google Chrome.app` detected locally) | — | Install Chrome locally, or run Lighthouse in CI on GH Actions/Vercel preview where Chrome is pre-installed |
| Lighthouse CLI | Perf budget audit | ✗ (no global; `npx lighthouse` requires internet to install) | — | `npx lighthouse@13` on demand; preferred path is Lighthouse CI in GitHub Actions / Vercel Preview |
| axe-core / @axe-core/cli | A11y audit | ✗ (no global) | — | `pnpm add -D @axe-core/cli` per-project, or run inside Playwright with `@axe-core/playwright` |
| Playwright | Optional E2E smoke (responsive screenshots) | ✗ (no global) | — | `pnpm add -D @playwright/test` if E2E desired; otherwise rely on Vitest + RTL for unit tests |

**Missing dependencies with no fallback:**
- None blocking. Landing page can be developed, built, and unit-tested with what's installed.

**Missing dependencies with fallback:**
- **Chrome / Lighthouse for local perf runs** → use CI (GitHub Actions has Chrome pre-installed) or install Chrome locally before final cut. Recommendation: run Lighthouse CI on every PR via `treosh/lighthouse-ci-action`.
- **axe-core / Playwright** → install dev-deps in `apps/web` when accessibility tests are written.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (recommended for Next 15 + React 19 app) + React Testing Library; **or** Jest if already configured in `apps/web` from Phase 1 |
| Config file | `apps/web/vitest.config.ts` (or `jest.config.ts`) — likely created in Phase 1 Wave 0; verify before assuming |
| Quick run command | `pnpm --filter web test -- src/components/landing` |
| Full suite command | `pnpm --filter web test` |
| Perf audit | `npx lighthouse-ci autorun --collect.url=http://localhost:3000` (or GH Action) |
| A11y audit | `pnpm exec playwright test apps/web/e2e/a11y.spec.ts` (with `@axe-core/playwright`) **or** `pnpm exec axe http://localhost:3000` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAND-01a | Hero renders headline, sub-headline, and CTA pointing to `/signup` | unit | `pnpm --filter web test -- src/components/landing/__tests__/Hero.test.tsx` | ❌ Wave 0 |
| LAND-01b | Pricing teaser renders 3 tiers; Pro + Premium tagged `Coming soon` | unit | `pnpm --filter web test -- src/components/landing/__tests__/PricingTeaser.test.tsx` | ❌ Wave 0 |
| LAND-01c | FAQ accordion renders ≥ 6 items and expand/collapse works (Radix `aria-expanded`) | unit (RTL + user-event) | `pnpm --filter web test -- src/components/landing/__tests__/FAQ.test.tsx` | ❌ Wave 0 |
| LAND-01d | All forbidden marketing verbs absent from rendered DOM (compliance copy lint) | unit | `pnpm --filter web test -- src/components/landing/__tests__/copy-compliance.test.tsx` | ❌ Wave 0 |
| LAND-01e | JSON-LD `Organization` + `FAQPage` present in HTML | unit (RTL `getByText` on `<script type=ld+json>`) | `pnpm --filter web test -- src/components/landing/__tests__/seo.test.tsx` | ❌ Wave 0 |
| LAND-02a | Mobile layout: hero stacks vertically; features grid is 1-col at `< 640px` | unit (RTL + `vi.matchMedia` mock) **or** Playwright responsive screenshot | `pnpm exec playwright test apps/web/e2e/landing-responsive.spec.ts` | ❌ Wave 0 (Playwright optional) |
| LAND-02b | Lighthouse mobile score ≥ 95 for Performance + Accessibility + Best Practices + SEO | smoke (Lighthouse CI) | `npx lighthouse-ci autorun --collect.url=http://localhost:3000` | ❌ Wave 0 (CI workflow) |
| LAND-02c | axe-core a11y audit: zero violations | smoke | `pnpm exec axe http://localhost:3000` | ❌ Wave 0 |
| LAND-02d | All interactive elements ≥ 44×44 px tap target | unit (RTL `getComputedStyle`) **or** axe rule `target-size` | covered by LAND-02c | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter web test -- src/components/landing` (< 10s)
- **Per wave merge:** `pnpm --filter web test` + `npx lighthouse-ci autorun` in PR
- **Phase gate:** Full suite green + Lighthouse mobile ≥ 95 + axe zero violations before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/web/src/components/landing/__tests__/Hero.test.tsx` — covers LAND-01a
- [ ] `apps/web/src/components/landing/__tests__/PricingTeaser.test.tsx` — covers LAND-01b
- [ ] `apps/web/src/components/landing/__tests__/FAQ.test.tsx` — covers LAND-01c (Radix accordion behavior)
- [ ] `apps/web/src/components/landing/__tests__/copy-compliance.test.tsx` — covers LAND-01d (forbid-list scan of rendered text)
- [ ] `apps/web/src/components/landing/__tests__/seo.test.tsx` — covers LAND-01e (JSON-LD presence + canonical/OG meta)
- [ ] (optional) `apps/web/e2e/landing-responsive.spec.ts` — covers LAND-02a (Playwright responsive screenshots at 375 / 768 / 1280)
- [ ] `.github/workflows/lighthouse.yml` (or Vercel preview check) — covers LAND-02b
- [ ] `.github/workflows/a11y.yml` (axe-core run) — covers LAND-02c
- [ ] Confirm framework: if `apps/web` was scaffolded with Jest in Phase 1, reuse Jest; if Vitest, reuse Vitest. **Do not introduce a second framework.**
- [ ] Install: `pnpm --filter web add -D @testing-library/react @testing-library/user-event @testing-library/jest-dom` (if missing)
- [ ] Install: `pnpm --filter web add -D @axe-core/cli` (or `@axe-core/playwright`)

## Security Domain

The landing page is **public, static, and stateless** — most ASVS categories don't apply. The relevant ones:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | (sign-up is in Phase 1; this page only links to `/signup`) |
| V3 Session Management | no | no session on landing |
| V4 Access Control | no | fully public |
| V5 Input Validation | no | no form inputs on landing (CTA navigates to `/signup`) |
| V6 Cryptography | no | n/a |
| V14 Configuration | yes | CSP headers via `next.config.js` `headers()`; HTTPS-only via hosting (Vercel default) |
| V11 Business Logic | yes | The "no advice" framing is a business-logic invariant enforced via the copy-compliance test |

### Known Threat Patterns for Landing Pages

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via injected marketing copy / CMS | Tampering | All copy is statically authored in TS source; no CMS; the one `dangerouslySetInnerHTML` (JSON-LD) takes a `JSON.stringify(...)` of a typed object — safe. |
| Clickjacking | Tampering | `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`) via `next.config.js` headers. |
| Third-party script injection via analytics | Tampering | Use first-party `@vercel/analytics` (no third-party origins) or a CSP `script-src` allowlist if Plausible/PostHog used. |
| Open redirect via CTA query param | Spoofing | CTA is a static `<Link href="/signup">` — no query param, no redirect logic. |
| Compliance violation (BUY/SELL framing) | Repudiation (legal) | Copy-compliance unit test (LAND-01d). |

Recommended `next.config.js` security headers:

```js
// Source: nextjs.org/docs/app/api-reference/next-config-js/headers
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      // CSP: tune for the analytics vendor chosen
      { key: 'Content-Security-Policy', value:
        "default-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline' va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' vitals.vercel-insights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
      },
    ],
  }];
}
```

## Sources

### Primary (HIGH confidence)
- **npm registry** (live query, 2026-05-28) — `next` 15.5.18 / 16.2.6, `tailwindcss` 4.3.0, `@vercel/analytics` 2.0.1, `lucide-react` 1.16.0, `react-wrap-balancer` 1.1.1, `plausible-tracker` 0.3.9, `posthog-js` 1.376.3, `embla-carousel-react` 8.6.0
- **ui.shadcn.com/docs/tailwind-v4** + **/docs/installation/next** — shadcn CLI Tailwind v4 + React 19 init
- **ui.shadcn.com/docs/components/accordion** + **/tabs** + **/card** — component APIs
- **nextjs.org/docs/app/api-reference/components/image** — `next/image` priority + sizes + AVIF
- **nextjs.org/docs/app/api-reference/components/font** — `next/font` self-host + `display: swap`
- **nextjs.org/docs/app/api-reference/file-conventions/route-segment-config** — `dynamic = 'force-static'`, `revalidate`
- **nextjs.org/docs/app/api-reference/next-config-js/headers** — security headers
- **tailwindcss.com/docs/v4-beta** (and v4 GA release notes) — `@theme` directive, mobile-first breakpoints
- **radix-ui.com/primitives/docs/components/accordion** — a11y semantics underlying shadcn
- **web.dev/vitals** — Core Web Vitals thresholds (LCP < 2.5s, CLS < 0.1, INP < 200ms)
- **vercel.com/docs/analytics** + **/privacy-policy** — cookieless analytics
- **schema.org/FAQPage** + **schema.org/Organization** — JSON-LD structured data
- **.planning/PROJECT.md, REQUIREMENTS.md, ROADMAP.md, research/SUMMARY.md, research/STACK.md** — locked invariants, requirement IDs, stack decisions

### Secondary (MEDIUM confidence)
- **W3C WCAG 2.5.5 + Apple HIG** — 44×44 px minimum tap target
- **Nielsen Norman Group** — carousel anti-pattern
- **Google Search Central** — JSON-LD eligibility for FAQ rich results (note: Google reduced FAQ rich-result eligibility in 2023 but the markup remains valid and useful)

### Tertiary (LOW confidence — flag for validation)
- Brand color / typography choices (Inter + neutral grays + oklch blue) — placeholder only; needs designer sign-off

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — npm-verified versions (2026-05-28); locked stack from STACK.md.
- Architecture (section list, RSC, force-static, Tailwind v4 `@theme`): **HIGH** — direct from Next.js + shadcn + Tailwind official docs.
- Pitfalls: **HIGH** — compliance pitfall grounded in SEBI Dec 2024 + project's COMP-01 enum; perf pitfalls grounded in Web Vitals public data.
- Validation architecture: **MEDIUM** — assumes Wave 0 will install testing deps; framework choice (Vitest vs. Jest) depends on Phase 1 scaffold not yet verified.
- Brand tokens: **LOW** — assumed; needs designer input.

**Research date:** 2026-05-28
**Valid until:** 2026-06-28 (30 days — Next.js 15 + Tailwind v4 + shadcn are stable; revisit if Next 16 adoption is reconsidered or if Tailwind v4.4+ ships breaking changes)
