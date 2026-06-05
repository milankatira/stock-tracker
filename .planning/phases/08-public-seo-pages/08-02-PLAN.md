---
phase: 08-public-seo-pages
plan: 02
type: execute
wave: 2
depends_on:
  - 08-01
files_modified:
  - apps/web/src/app/sitemap.ts
  - apps/web/src/app/robots.ts
  - apps/web/src/app/stock/[ticker]/opengraph-image.tsx
  - apps/web/src/app/fund/[schemeCode]/opengraph-image.tsx
  - apps/web/src/app/opengraph-image.png
  - apps/web/src/app/api/revalidate/route.ts
  - apps/web/src/lib/revalidate-secret.ts
  - apps/web/__tests__/api/revalidate.route.test.ts
  - apps/web/__tests__/lib/revalidate-secret.test.ts
  - apps/web/__tests__/seo/sitemap.test.ts
  - apps/web/__tests__/seo/robots.test.ts
  - apps/web/.env.example
  - apps/api/src/jobs/eod-recompute.service.ts
  - apps/api/src/jobs/narrative-batch.service.ts
  - apps/api/src/revalidate/revalidate-webhook.client.ts
  - apps/api/src/revalidate/revalidate-webhook.client.spec.ts
  - apps/api/.env.example
autonomous: true
requirements:
  - SEO-03

user_setup:
  - service: revalidate-webhook
    why: "HMAC-signed webhook from NestJS jobs to Next.js for on-demand cache invalidation when scores/narratives are recomputed"
    env_vars:
      - name: REVALIDATE_WEBHOOK_SECRET
        source: "Generate locally with `openssl rand -hex 32`; store identically in apps/web/.env.local AND apps/api/.env.local. In production mirror via secret manager (AWS Secrets Manager, GCP Secret Manager) to both services."
        notes: "32-byte hex. Rotate by deploying both services with the new value simultaneously. NEVER commit. NEVER NEXT_PUBLIC_*."

must_haves:
  truths:
    - "A fresh deploy generates sitemap.xml at /sitemap.xml containing one <url> entry per stock and per fund in the instrument master"
    - "robots.txt at /robots.txt allows /stock/ and /fund/, disallows /api/ and /app/, and links the sitemap"
    - "Per-ticker OG images render dynamically via next/og ImageResponse on Edge runtime; a static brand fallback covers long-tail"
    - "POSTing a valid HMAC-signed payload to /api/revalidate returns 200 and invalidates the specified Next.js cache tags"
    - "POSTing an invalid HMAC signature returns 401 with no diagnostic detail"
    - "The HMAC comparison uses crypto.timingSafeEqual (NOT ===) on equal-length buffers"
    - "Phase 3's eod-recompute job calls the webhook after each per-instrument recompute"
    - "Phase 4's narrative-batch job calls the webhook after each per-instrument narrative write"
  artifacts:
    - path: "apps/web/src/app/sitemap.ts"
      provides: "Dynamic sitemap from instrument master with generateSitemaps split for the 50k cap"
      exports: ["default", "generateSitemaps"]
    - path: "apps/web/src/app/robots.ts"
      provides: "Typed robots.txt allowing public routes, disallowing internal routes, linking sitemap"
      exports: ["default"]
    - path: "apps/web/src/app/stock/[ticker]/opengraph-image.tsx"
      provides: "Per-ticker OG image via next/og ImageResponse (Satori, Edge runtime)"
    - path: "apps/web/src/app/fund/[schemeCode]/opengraph-image.tsx"
      provides: "Per-fund OG image"
    - path: "apps/web/src/app/opengraph-image.png"
      provides: "Static 1200x630 brand fallback OG image"
    - path: "apps/web/src/app/api/revalidate/route.ts"
      provides: "POST handler verifying HMAC SHA-256 and calling revalidateTag for each tag in body"
      exports: ["POST"]
    - path: "apps/web/src/lib/revalidate-secret.ts"
      provides: "Pure HMAC verifier — signPayload and verifySignature using crypto.timingSafeEqual"
      exports: ["verifySignature", "signPayload"]
    - path: "apps/api/src/revalidate/revalidate-webhook.client.ts"
      provides: "NestJS-side fire-and-forget POST to Next.js /api/revalidate with HMAC signing"
      exports: ["RevalidateWebhookClient"]
  key_links:
    - from: "apps/web/src/app/api/revalidate/route.ts"
      to: "apps/web/src/lib/revalidate-secret.ts"
      via: "import and call to verifySignature"
      pattern: "verifySignature\\("
    - from: "apps/web/src/app/api/revalidate/route.ts"
      to: "next/cache"
      via: "import and per-tag call to revalidateTag (single-arg form for Next 15.5)"
      pattern: "revalidateTag\\("
    - from: "apps/api/src/jobs/eod-recompute.service.ts"
      to: "apps/api/src/revalidate/revalidate-webhook.client.ts"
      via: "injected client; fire-and-forget call after per-instrument write"
      pattern: "RevalidateWebhookClient"
    - from: "apps/api/src/jobs/narrative-batch.service.ts"
      to: "apps/api/src/revalidate/revalidate-webhook.client.ts"
      via: "injected client; fire-and-forget call after per-instrument narrative write"
      pattern: "RevalidateWebhookClient"
    - from: "apps/web/src/app/sitemap.ts"
      to: "apps/web/src/lib/data/instrument-master.ts"
      via: "server-side await on listAllTickers / listAllSchemeCodes"
      pattern: "listAll(Tickers|SchemeCodes)"
---

<objective>
Finish SEO-03 (sitemap + robots + OG image bytes) and wire on-demand cache freshness from NestJS background jobs.

This plan delivers:
1. sitemap.ts and robots.ts (typed MetadataRoute; framework-handled XML / text formatting + caching).
2. Per-ticker and per-fund dynamic OG images via next/og ImageResponse, plus a static brand fallback for long-tail.
3. A HMAC-signed /api/revalidate Route Handler with TDD-driven crypto primitives.
4. Cross-phase write: call sites in Phase 3 eod-recompute job and Phase 4 narrative-batch job that POST to the
   webhook after each per-instrument write — when scores or narratives change, the public page invalidates within
   seconds, not 24 hours.

Purpose: Without sitemap/robots Google cannot discover the universe of pages. Without OG images social shares fall
back to default. Without the webhook the ISR safety floor (revalidate = 86400 from Plan 01) is the ONLY invalidation
path — up to 24h of stale scores indexed by Google. Each part is necessary; none is optional.

Output:
- sitemap.ts + robots.ts emitting valid XML and robots.txt
- Two opengraph-image.tsx files (one per dynamic route) + a static fallback PNG
- /api/revalidate Route Handler with verified HMAC SHA-256 + timingSafeEqual comparison
- Cross-phase patches into NestJS job services with a reusable client and Jest unit tests for the signing logic
</objective>

<decision_coverage_matrix>
Plan 01 covered SEO-01, SEO-02, SEO-04 fully and SEO-03 page-level. Plan 02 closes SEO-03 and reinforces SEO-04.

| REQ-ID | Plan | Task | Full/Partial | Notes |
|--------|------|------|--------------|-------|
| SEO-03 | 02 | 1, 2 | Full | sitemap.ts + robots.ts (Task 1) + opengraph-image.tsx (Task 2). Combined with Plan 01 inline JSON-LD + canonical + OG meta, SEO-03 is fully delivered. |
| SEO-04 (operational reinforcement) | 02 | 3 | Full | Webhook ensures stale ISR doesn't undermine the materialised-read invariant — recomputed scores reflect on the next request, not 24h later. |

No PARTIAL deliveries. No "v1 / placeholder" scope reductions.
</decision_coverage_matrix>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/research/SUMMARY.md
@.planning/research/PITFALLS.md
@.planning/phases/08-public-seo-pages/08-RESEARCH.md
@.planning/phases/08-public-seo-pages/08-01-SUMMARY.md

<!--
FORWARD-DECLARED DEPENDENCIES (cross-phase write):
Plan 02 modifies files in apps/api/src/jobs/* that are owned by Phase 3 (eod-recompute) and Phase 4 (narrative-batch).
At execute time, if those services do not exist yet, the executor MUST:
  (a) create the directory with a TODO marker pointing at Phase 3 and Phase 4,
  (b) implement the RevalidateWebhookClient + its unit tests as a standalone Nest provider,
  (c) leave a clear inline comment in the job services with the exact lines to add when those phases ship.
This is documented up-front so the executor does not conflate "phase not ready" with "plan broken."
-->

<interfaces>
<!-- Contracts in Plan 01 we depend on -->

apps/web/src/lib/data/stock-report.ts (Plan 01) tags fetches with:
  next: { tags: ["stock:<TICKER>", "stock-report"], revalidate: 86400 }
Therefore revalidateTag("stock:RELIANCE") precisely drops just that page's cache.

apps/web/src/lib/data/fund-report.ts (Plan 01) tags fetches with:
  next: { tags: ["fund:<SCHEMECODE>", "fund-report"], revalidate: 86400 }

apps/web/src/lib/data/instrument-master.ts (Plan 01) exports:
  listAllTickers(): Promise<Array<{ symbol: string; lastReportComputedAt?: Date }>>
  listAllSchemeCodes(): Promise<Array<{ schemeCode: string; lastReportComputedAt?: Date }>>

<!-- New contracts in Plan 02 -->

apps/web/src/lib/revalidate-secret.ts (pure, TDD):
  export function signPayload(rawBody: string, secret: string): string  // hex HMAC SHA-256
  export function verifySignature(rawBody: string, headerHex: string, secret: string): boolean

apps/api/src/revalidate/revalidate-webhook.client.ts (NestJS Injectable):
  @Injectable() class RevalidateWebhookClient {
    constructor(private readonly config: ConfigService) {}
    // Fire-and-forget; never throws into caller. Logs on failure.
    invalidateTags(tags: string[]): Promise<void>
  }
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: sitemap.ts and robots.ts from instrument master (SEO-03)</name>
  <files>
    apps/web/src/app/sitemap.ts,
    apps/web/src/app/robots.ts,
    apps/web/__tests__/seo/sitemap.test.ts,
    apps/web/__tests__/seo/robots.test.ts
  </files>
  <action>
Implement sitemap.ts exactly per Pattern 5 in 08-RESEARCH.md. Read instrument master via listAllTickers and listAllSchemeCodes (created in Plan 01); emit one entry per stock and per fund plus the root URL.

Handle the 50k-URL cap defensively even though the combined universe is well under 50k today (NIFTY 500 + ~5000 listed + ~2000 funds is roughly 7,500). Implement generateSitemaps so the structure is future-proof.

Reference code (apps/web/src/app/sitemap.ts):

```
import type { MetadataRoute } from 'next'
import { listAllTickers, listAllSchemeCodes } from '@/lib/data/instrument-master'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://finsight.ai'
const URLS_PER_SITEMAP = 45000  // safety margin under Google's 50k cap

export async function generateSitemaps() {
  const [tickers, schemes] = await Promise.all([listAllTickers(), listAllSchemeCodes()])
  const total = tickers.length + schemes.length + 1
  const count = Math.max(1, Math.ceil(total / URLS_PER_SITEMAP))
  return Array.from({ length: count }, (_, i) => ({ id: i }))
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const [tickers, schemes] = await Promise.all([listAllTickers(), listAllSchemeCodes()])
  const all: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    ...tickers.map((t) => ({
      url: SITE + '/stock/' + t.symbol,
      lastModified: t.lastReportComputedAt ?? new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...schemes.map((s) => ({
      url: SITE + '/fund/' + s.schemeCode,
      lastModified: s.lastReportComputedAt ?? new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ]
  const start = id * URLS_PER_SITEMAP
  return all.slice(start, start + URLS_PER_SITEMAP)
}
```

Reference code (apps/web/src/app/robots.ts):

```
import type { MetadataRoute } from 'next'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://finsight.ai'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: ['/', '/stock/', '/fund/'], disallow: ['/api/', '/app/', '/auth/'] },
    ],
    sitemap: SITE + '/sitemap.xml',
    host: SITE,
  }
}
```

Tests:

apps/web/__tests__/seo/sitemap.test.ts:
- Mock listAllTickers to return [{ symbol: 'RELIANCE', lastReportComputedAt: new Date('2026-05-27') }] and listAllSchemeCodes to return [{ schemeCode: '120503', lastReportComputedAt: new Date('2026-05-27') }]
- Call default export with { id: 0 }
- Assert returned array contains entries with URLs https://finsight.ai/stock/RELIANCE and https://finsight.ai/fund/120503 plus the root URL
- Assert changeFrequency 'daily' on instrument entries
- Assert generateSitemaps returns at least [{ id: 0 }]

apps/web/__tests__/seo/robots.test.ts:
- Call default export
- Assert rules.allow includes /stock/ and /fund/; rules.disallow includes /api/
- Assert sitemap === 'https://finsight.ai/sitemap.xml'
  </action>
  <verify>
    <automated>cd apps/web && pnpm test -- --run __tests__/seo/sitemap.test.ts __tests__/seo/robots.test.ts && (pnpm dev &) && sleep 6 && curl -sI http://localhost:3000/sitemap.xml | grep -i "content-type" | grep -i "xml" && curl -sI http://localhost:3000/robots.txt | grep -i "content-type" | grep -i "plain" && pkill -f "next dev" || true</automated>
  </verify>
  <done>
- apps/web/src/app/sitemap.ts and apps/web/src/app/robots.ts exist
- Vitest tests pass
- curl http://localhost:3000/sitemap.xml returns XML with urlset containing the stock and fund entries (Content-Type xml)
- curl http://localhost:3000/robots.txt returns text including Allow: /stock/, Allow: /fund/, Disallow: /api/, Sitemap: https://finsight.ai/sitemap.xml (Content-Type text/plain)
- generateSitemaps future-proofs the 50k cap
  </done>
</task>

<task type="auto">
  <name>Task 2: opengraph-image.tsx for both routes plus static brand fallback (SEO-03)</name>
  <files>
    apps/web/src/app/stock/[ticker]/opengraph-image.tsx,
    apps/web/src/app/fund/[schemeCode]/opengraph-image.tsx,
    apps/web/src/app/opengraph-image.png
  </files>
  <action>
Strategy (resolves OPEN QUESTION 4 from research): dynamic per-ticker OG image for the top-N (statically optimised at build because params come from generateStaticParams in Plan 01); long-tail tickers fall back to a minimal branded card rendered by the same dynamic function (response is still 200 OK so social embeds work) AND the root-level static brand fallback covers any route that has no co-located image.

apps/web/src/app/stock/[ticker]/opengraph-image.tsx — Edge runtime, Satori-based via next/og ImageResponse:

```
import { ImageResponse } from 'next/og'
import { getStockReportFromMaterialisedStore } from '@/lib/data/stock-report'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Note: Next 15.5 — params is a sync object (NOT a Promise; that's 16+)
export default async function OgImage({ params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase()
  const report = await getStockReportFromMaterialisedStore(ticker, {
    cacheTags: ['stock:' + ticker],
  })

  const headline = report
    ? report.name + ' — FinSight Score ' + report.score + '/10'
    : ticker + ' — FinSight Analysis'
  const sub = report ? report.verdictLabel : 'Analysis loading'

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: '60px',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.7, marginBottom: 12 }}>FinSight AI</div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1, marginBottom: 24 }}>{headline}</div>
        <div style={{ fontSize: 40, opacity: 0.85 }}>{sub}</div>
        <div style={{ fontSize: 22, opacity: 0.6, marginTop: 40 }}>Analysis, not investment advice.</div>
      </div>
    ),
    { ...size }
  )
}
```

apps/web/src/app/fund/[schemeCode]/opengraph-image.tsx — mirror; uses getFundReportFromMaterialisedStore, displays scheme name + Fund Score + verdict label. Same Edge runtime, size, contentType, ImageResponse pattern.

apps/web/src/app/opengraph-image.png — 1200x630 PNG static brand fallback. Acceptable initial implementation:

1. Generate via a one-off Node script using @vercel/og or sharp with the same gradient + "FinSight AI — Analysis, not investment advice." text.
2. Commit the resulting PNG.

If a design asset is preferred and available, drop it in at the same path; Next will serve it for any layout that does not have a co-located image. Do NOT block the task on a designer dependency — the generated placeholder is acceptable.

Important constraints:
- runtime = 'edge' is required for ImageResponse.
- The Edge runtime cannot directly access Node-only modules. The fetch-based data layer from Plan 01 works in Edge. If INTERNAL_API_SECRET cannot be exposed to Edge (it MUST NOT be NEXT_PUBLIC), Phase 4 should expose an unauthenticated public read endpoint at GET /reports/stock/:ticker/public that returns the same DTO minus any internal fields. Plan a TODO note for Phase 4 if this endpoint doesn't exist yet.
- Do NOT import @google/genai. The ESLint guard from Plan 01 already scopes app/stock/** and app/fund/**.
- No new test file in this task; build pre-rendering covers correctness; smoke test in verify proves HTTP shape.
  </action>
  <verify>
    <automated>cd apps/web && pnpm build 2>&1 | tee /tmp/build.log && grep -E "opengraph-image" /tmp/build.log && (pnpm start &) && sleep 6 && curl -sI http://localhost:3000/stock/RELIANCE/opengraph-image | grep -i "content-type" | grep -i "image/png" && curl -sI http://localhost:3000/fund/120503/opengraph-image | grep -i "content-type" | grep -i "image/png" && pkill -f "next start" || true</automated>
  </verify>
  <done>
- apps/web/src/app/stock/[ticker]/opengraph-image.tsx and apps/web/src/app/fund/[schemeCode]/opengraph-image.tsx exist with runtime = 'edge'
- apps/web/src/app/opengraph-image.png exists (1200x630)
- pnpm build output shows opengraph-image entries under both routes
- curl http://localhost:3000/stock/RELIANCE/opengraph-image returns Content-Type image/png with status 200
- curl http://localhost:3000/fund/120503/opengraph-image returns Content-Type image/png with status 200
- ESLint guard remains clean — no @google/genai imports under either route tree
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: HMAC-signed /api/revalidate webhook + NestJS client + Phase 3/4 call sites</name>
  <files>
    apps/web/src/app/api/revalidate/route.ts,
    apps/web/src/lib/revalidate-secret.ts,
    apps/web/__tests__/lib/revalidate-secret.test.ts,
    apps/web/__tests__/api/revalidate.route.test.ts,
    apps/web/.env.example,
    apps/api/src/revalidate/revalidate-webhook.client.ts,
    apps/api/src/revalidate/revalidate-webhook.client.spec.ts,
    apps/api/src/jobs/eod-recompute.service.ts,
    apps/api/src/jobs/narrative-batch.service.ts,
    apps/api/.env.example
  </files>
  <behavior>
    - signPayload(rawBody, secret) returns hex HMAC SHA-256 of rawBody using secret
    - verifySignature returns true for matching signatures (case-sensitive hex)
    - verifySignature returns false for tampered body (digest mismatch)
    - verifySignature returns false for wrong-secret signatures
    - verifySignature returns false when header is shorter than expected (length mismatch — must NOT throw on unequal-length buffers; must return false instead, because Node crypto.timingSafeEqual throws on length mismatch)
    - verifySignature returns false when header is empty or missing
    - verifySignature uses crypto.timingSafeEqual under the hood (assert via spy in unit test)
    - POST /api/revalidate with valid signature returns 200 with JSON { revalidated: true, tags: [...] }
    - POST /api/revalidate with invalid signature returns 401 with JSON { error: 'invalid signature' } and NO diagnostic detail (no stack trace, no leaked secret)
    - POST /api/revalidate calls revalidateTag once per tag in the payload (single-arg form, Next 15.5)
    - RevalidateWebhookClient.invalidateTags fires a POST with x-finsight-signature header and JSON body; never throws into caller; logs on non-2xx
    - RevalidateWebhookClient unit test asserts the signature header equals signPayload(JSON.stringify(body), secret)
  </behavior>
  <action>
This task is TDD-driven for the crypto primitive (signing + verification) and HTTP surface. Implement RED → GREEN → REFACTOR for each.

Step A — apps/web/src/lib/revalidate-secret.ts (pure, no I/O):

```
import { createHmac, timingSafeEqual } from 'node:crypto'

export function signPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

export function verifySignature(rawBody: string, headerHex: string, secret: string): boolean {
  if (!headerHex) return false
  const expected = signPayload(rawBody, secret)
  // Buffers must be equal-length BEFORE timingSafeEqual — it throws on length mismatch.
  if (headerHex.length !== expected.length) return false
  try {
    const expectedBuf = Buffer.from(expected, 'hex')
    const receivedBuf = Buffer.from(headerHex, 'hex')
    if (receivedBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(receivedBuf, expectedBuf)
  } catch {
    // Malformed hex throws — treat as invalid signature.
    return false
  }
}
```

Step B — apps/web/__tests__/lib/revalidate-secret.test.ts:
- Test: signPayload produces deterministic output for fixed input + secret
- Test: verifySignature returns true for matching pair
- Test: verifySignature returns false for tampered body
- Test: verifySignature returns false for wrong secret
- Test: verifySignature returns false for empty / missing header (no throw)
- Test: verifySignature returns false for malformed hex (e.g. 'zzz') (no throw)
- Test: verifySignature returns false for length-mismatched buffers (e.g. truncated header)
- Test: spy on node:crypto timingSafeEqual to confirm it is called when lengths match (use vi.spyOn after vi.mock of node:crypto module — verify behaviour, not implementation, if simpler)

Step C — apps/web/src/app/api/revalidate/route.ts:

```
import { revalidateTag } from 'next/cache'
import { NextRequest } from 'next/server'
import { verifySignature } from '@/lib/revalidate-secret'

const SECRET = process.env.REVALIDATE_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  if (!SECRET) {
    // Fail closed — never accept requests if secret is unconfigured.
    return Response.json({ error: 'invalid signature' }, { status: 401 })
  }

  const rawBody = await request.text()
  const signatureHeader = request.headers.get('x-finsight-signature') ?? ''

  if (!verifySignature(rawBody, signatureHeader, SECRET)) {
    return Response.json({ error: 'invalid signature' }, { status: 401 })
  }

  let payload: { tags: string[] }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return Response.json({ error: 'invalid signature' }, { status: 401 })  // do not leak parse detail
  }

  if (!payload || !Array.isArray(payload.tags) || payload.tags.length === 0) {
    return Response.json({ error: 'invalid signature' }, { status: 401 })
  }

  // Next 15.5: single-arg revalidateTag (16+ requires a profile arg — DO NOT use here).
  for (const tag of payload.tags) {
    revalidateTag(tag)
  }

  return Response.json({ revalidated: true, tags: payload.tags, now: Date.now() })
}
```

Step D — apps/web/__tests__/api/revalidate.route.test.ts:
- vi.mock('next/cache', () => ({ revalidateTag: vi.fn() })) so call counts are observable
- Test: valid signature → 200 + JSON + revalidateTag called once per tag
- Test: invalid signature (tampered body) → 401 + { error: 'invalid signature' } + revalidateTag NEVER called
- Test: missing x-finsight-signature header → 401 + revalidateTag NEVER called
- Test: missing tags array in payload → 401 (do not leak parse detail)
- Test: malformed JSON body with valid signature on the malformed text → 401 (defence in depth)
- Test: env REVALIDATE_WEBHOOK_SECRET unset → 401 + revalidateTag NEVER called
- For each test set process.env.REVALIDATE_WEBHOOK_SECRET via vi.stubEnv

Step E — apps/api/src/revalidate/revalidate-webhook.client.ts (NestJS):

```
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac } from 'node:crypto'

@Injectable()
export class RevalidateWebhookClient {
  private readonly logger = new Logger(RevalidateWebhookClient.name)

  constructor(private readonly config: ConfigService) {}

  async invalidateTags(tags: string[]): Promise<void> {
    if (!tags.length) return
    const secret = this.config.get<string>('REVALIDATE_WEBHOOK_SECRET')
    const baseUrl = this.config.get<string>('WEB_BASE_URL')
    if (!secret || !baseUrl) {
      this.logger.warn('REVALIDATE_WEBHOOK_SECRET or WEB_BASE_URL not configured; skipping invalidation')
      return
    }
    const body = JSON.stringify({ tags })
    const signature = createHmac('sha256', secret).update(body).digest('hex')
    try {
      const res = await fetch(baseUrl + '/api/revalidate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-finsight-signature': signature },
        body,
        // No retries — webhook is best-effort; ISR safety floor (revalidate=86400) covers eventual consistency.
      })
      if (!res.ok) {
        this.logger.warn('Revalidate webhook returned ' + res.status + ' for tags ' + JSON.stringify(tags))
      }
    } catch (err) {
      this.logger.warn('Revalidate webhook call failed: ' + (err as Error).message)
      // Never throw into caller — fire-and-forget.
    }
  }
}
```

Step F — apps/api/src/revalidate/revalidate-webhook.client.spec.ts (Jest):
- Test: invalidateTags POSTs to baseUrl + '/api/revalidate' with correct body
- Test: signature header equals createHmac('sha256', secret).update(body).digest('hex') — verifiable via spy on global.fetch reading the call args
- Test: missing secret OR missing baseUrl → no fetch, logs a warning, does not throw
- Test: fetch rejection → no throw, logs warning
- Test: non-2xx response → no throw, logs warning
- Mock global.fetch via jest.spyOn(global, 'fetch') or undici MockAgent

Step G — Phase 3 and Phase 4 call sites (CROSS-PHASE WRITE):

apps/api/src/jobs/eod-recompute.service.ts (Phase 3 owner) — inject RevalidateWebhookClient and, after each per-instrument score write to Mongo, call:

```
await this.webhookClient.invalidateTags(['stock:' + ticker])
// or for funds:
await this.webhookClient.invalidateTags(['fund:' + schemeCode])
```

apps/api/src/jobs/narrative-batch.service.ts (Phase 4 owner) — inject RevalidateWebhookClient and after each per-instrument narrative write, call invalidateTags with the same tag.

IF eod-recompute.service.ts or narrative-batch.service.ts DOES NOT EXIST at execute time (Phase 3 or 4 not yet planned/executed):
1. Do NOT create stub services that would conflict with future Phase 3/4 implementations.
2. Instead, create the RevalidateWebhookClient + its module wiring as a standalone Nest provider.
3. Append a clearly-marked TODO file at apps/api/src/revalidate/PHASE-WIRING.md listing the exact lines to add to each job service, with file paths and code snippets, so Phase 3 and Phase 4 executors pick it up.
4. Note the deferred wiring in the SUMMARY.

Add to apps/web/.env.example:
```
REVALIDATE_WEBHOOK_SECRET=
```
Add to apps/api/.env.example:
```
REVALIDATE_WEBHOOK_SECRET=
WEB_BASE_URL=http://localhost:3000
```

Document in the SUMMARY that the user must generate the secret via openssl rand -hex 32 and mirror it identically to both .env.local files (see user_setup frontmatter).
  </action>
  <verify>
    <automated>cd apps/web && pnpm test -- --run __tests__/lib/revalidate-secret.test.ts __tests__/api/revalidate.route.test.ts && cd ../api && pnpm test -- --run revalidate-webhook.client.spec.ts</automated>
  </verify>
  <done>
- All Vitest tests for revalidate-secret and revalidate route pass (GREEN). Negative tests confirm 401 paths.
- All Jest tests for RevalidateWebhookClient pass. Signature header is asserted equal to expected HMAC.
- crypto.timingSafeEqual is used in verifySignature (NOT ===). Length-mismatch path returns false without throwing.
- /api/revalidate route exists; manual test:
  1. Start dev server: pnpm --filter @finsight/web dev
  2. SECRET=$(grep REVALIDATE_WEBHOOK_SECRET apps/web/.env.local | cut -d= -f2)
  3. BODY='{"tags":["stock:RELIANCE"]}'
  4. SIG=$(node -e "console.log(require('crypto').createHmac('sha256', process.argv[1]).update(process.argv[2]).digest('hex'))" "$SECRET" "$BODY")
  5. curl -X POST -H "content-type: application/json" -H "x-finsight-signature: $SIG" --data "$BODY" http://localhost:3000/api/revalidate
  6. Expected: 200 + { revalidated: true, tags: ['stock:RELIANCE'], now: <timestamp> }
  7. curl -X POST -H "content-type: application/json" -H "x-finsight-signature: bad" --data "$BODY" http://localhost:3000/api/revalidate
  8. Expected: 401 + { error: 'invalid signature' }
- RevalidateWebhookClient exists and is wired into eod-recompute.service.ts and narrative-batch.service.ts if those services exist; otherwise apps/api/src/revalidate/PHASE-WIRING.md documents the exact wiring lines for Phase 3 and Phase 4 executors.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sitemap.xml / robots.txt crawler reads | Public, anonymous, no sensitive data exposed |
| /opengraph-image dynamic route render | Public, anonymous; reads same materialised store as Plan 01 page render |
| /api/revalidate POST handler | UNTRUSTED inbound — only valid HMAC-signed requests from NestJS jobs may invalidate cache |
| NestJS RevalidateWebhookClient -> Next.js /api/revalidate | Internal service-to-service; secret shared via env/secret manager |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-12 | Denial of Service | /api/revalidate flooded with invalid signatures → cache thrash + handler CPU on HMAC verify | mitigate | HMAC verify is O(1) and cheap; pair with edge/CDN rate-limit (e.g. 100/min per source IP) — wire at deploy time. Also: revalidateTag is idempotent so even valid floods cause at most one re-render per tag per TTL. |
| T-08-13 | Information Disclosure | Webhook secret leaked via query string, header echo, or log dump | mitigate | Signature in header (x-finsight-signature), NOT query string. Route handler returns ONLY { error: 'invalid signature' } — no diagnostic detail. Logs MUST NOT include the signature header verbatim. Rotate secret on suspicion. |
| T-08-14 | Information Disclosure | Timing attack on secret comparison | mitigate | crypto.timingSafeEqual on equal-length buffers. Length mismatch returns false early (must NOT call timingSafeEqual with unequal lengths — it throws). Verified in unit test. |
| T-08-15 | Tampering | Replay of a captured valid request | accept | revalidateTag is idempotent; replay only triggers re-render of already-revalidated content. No state mutation, no privilege gained. Future hardening: add a nonce or timestamp window — not required for v1. |
| T-08-16 | Spoofing | Attacker forges a signature without the secret | mitigate | HMAC SHA-256 with 32-byte secret. Forgery infeasible without the secret. Secret loaded from env/secret manager only. |
| T-08-17 | Information Disclosure | Stack trace leaked from /api/revalidate on internal error | mitigate | Handler catches all paths and returns { error: 'invalid signature' } only. No try/catch that exposes err.message. |
| T-08-18 | Elevation of Privilege | OG image route somehow gets called with auth context | accept | OG route is anonymous, Edge runtime, no cookies parsed. No privilege to elevate. |
| T-08-19 | Tampering | sitemap.xml manipulated to include pages that should not be indexed (e.g. /admin) | mitigate | sitemap.ts hardcodes the path prefixes /stock/ and /fund/ from the typed instrument master. No user input flows in. |
| T-08-20 | Compliance | OG image text contains forbidden BUY/SELL verbs | mitigate (inherited) | Verdict label is the typed enum from the precomputed report; OG image renders it verbatim — same compliance guarantee as the page. No additional path. |
| T-08-21 | Denial of Service | Mongo or NestJS API down -> sitemap returns empty -> Google de-indexes site | mitigate | Sitemap fetches are tagged with revalidate (e.g. 3600s) so a transient outage serves the last-good cached sitemap. Monitor sitemap.xml availability separately. |
</threat_model>

<verification>
Phase-level checks (run after Task 3):

- [ ] cd apps/web && pnpm test -- --run — full Vitest suite GREEN (Plan 01 + Plan 02 combined)
- [ ] cd apps/api && pnpm test -- --run — RevalidateWebhookClient Jest tests GREEN
- [ ] cd apps/web && pnpm build — succeeds; output shows sitemap, robots, opengraph-image entries; prerendered route count matches Plan 01
- [ ] (pnpm --filter @finsight/web start &) ; sleep 5 ; curl -s http://localhost:3000/sitemap.xml | grep -E "<loc>https://finsight.ai/stock/" — at least one stock URL present
- [ ] curl -s http://localhost:3000/robots.txt | grep -E "Sitemap: https://finsight.ai/sitemap.xml" — sitemap linked
- [ ] curl -sI http://localhost:3000/stock/RELIANCE/opengraph-image | grep -i "image/png" — OG image rendered
- [ ] curl -sI http://localhost:3000/fund/120503/opengraph-image | grep -i "image/png" — OG image rendered
- [ ] HMAC happy path:
       BODY='{"tags":["stock:RELIANCE"]}' ; SIG=$(node -e "console.log(require('crypto').createHmac('sha256', '<SECRET>').update('"$BODY"').digest('hex'))") ; curl -X POST -H "x-finsight-signature: $SIG" -H "content-type: application/json" --data "$BODY" http://localhost:3000/api/revalidate
       Expected: 200 + { revalidated: true, tags: [...] }
- [ ] HMAC sad path: curl -X POST -H "x-finsight-signature: bad" -H "content-type: application/json" --data '{"tags":["stock:RELIANCE"]}' http://localhost:3000/api/revalidate
       Expected: 401 + { error: 'invalid signature' }
- [ ] Phase wiring: either eod-recompute.service.ts and narrative-batch.service.ts contain RevalidateWebhookClient.invalidateTags calls, OR apps/api/src/revalidate/PHASE-WIRING.md exists with exact wiring instructions for Phase 3 and Phase 4 executors.
- [ ] Plan 01 page test still passes (regression check): no Plan 02 file accidentally re-introduces a Gemini import under app/stock/** or app/fund/**.
</verification>

<success_criteria>
1. /sitemap.xml returns valid XML enumerating every stock and every fund in the instrument master, plus root.
2. /robots.txt allows public route trees, disallows internal routes, links /sitemap.xml.
3. /stock/[ticker]/opengraph-image and /fund/[schemeCode]/opengraph-image return 1200x630 image/png via Edge runtime.
4. Static brand fallback /opengraph-image.png exists for any layout that lacks a co-located image.
5. POST /api/revalidate verifies HMAC SHA-256 via crypto.timingSafeEqual; valid → 200 + revalidateTag invoked per tag; invalid → 401 with no diagnostic detail.
6. RevalidateWebhookClient is wired into Phase 3 eod-recompute and Phase 4 narrative-batch (or PHASE-WIRING.md exists with explicit instructions if those services have not been built yet).
7. SEO-03 fully delivered across Plan 01 (inline JSON-LD, canonical, OG/Twitter meta) and Plan 02 (sitemap.ts, robots.ts, opengraph-image.tsx).
</success_criteria>

<output>
After completion, create .planning/phases/08-public-seo-pages/08-02-SUMMARY.md covering:
- Files created (paths + line counts)
- Tests passing (count + names + RED→GREEN evidence for the TDD task)
- curl proof for sitemap.xml + robots.txt + both opengraph-image routes (10-line excerpts)
- curl proof for /api/revalidate happy + sad paths
- Phase wiring status: actual call sites added vs PHASE-WIRING.md deferred
- Generated secret rotation runbook (link to user_setup frontmatter)
- Open questions resolved: OG image strategy (dynamic per-ticker top-N + minimal-branded long-tail + static fallback), hosting target (assume Vercel-style on-demand ISR — Vercel/Netlify/self-hosted next start all supported; static-only hosts fall back to ISR safety floor)
</output>
