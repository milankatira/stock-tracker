# Phase 6: News Feed & Sentiment - Research

**Researched:** 2026-05-28
**Domain:** RSS/news ingestion + Gemini embeddings + Atlas Vector Search + Gemini sentiment classification + scoring pillar feedback
**Confidence:** HIGH (core stack, Gemini APIs, Atlas Vector Search) / MEDIUM (exact RSS feed paths for Indian publishers — see Assumptions Log)

---

## Project Constraints (from CLAUDE.md)

This project's `./CLAUDE.md` is a generated developer-profile file (communication, debugging, UX style directives). It contains **no engineering or security rules** that constrain this phase. The user-global CLAUDE.md (lean-ctx, AW router, platform security rules) governs general engineering conduct and is honored in the recommendations below (no hardcoded secrets, DPDP residency = Atlas Mumbai, structured logging, DTO validation, no bare `any`).

No `.planning/phases/06-news-feed-sentiment/*-CONTEXT.md` exists — no user constraints have been captured from `/gsd-discuss-phase`. The locked decisions in the spawn prompt (Gemini 768-dim embeddings, ComplianceInterceptor on every Gemini call, graceful neutral fallback in ScoringModule) are treated as project-level invariants and are not re-litigated below.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **NEWS-01** | User can see the latest news items for a stock on its report | Section A (RSS + NewsData.io ingestion), B (News schema), G (Frontend feed component) |
| **NEWS-02** | Each news item shows an AI sentiment tag (Positive / Negative / Neutral) that passed the compliance interceptor | Section E (Gemini classifier), Section H pitfalls (interceptor enforcement) |
| **NEWS-03** | News article embeddings (gemini-embedding-001 @ 768 dims) are indexed in Atlas Vector Search for semantic retrieval | Section C (embeddings), D (Atlas Vector Search index + `$vectorSearch`) |
| **NEWS-04** | Aggregated news sentiment feeds the Sentiment pillar of the scoring engine (replacing neutral fallback) | Section F (aggregation formula, ScoreInput integration, recompute trigger) |

---

## Summary

This phase wires a five-stage pipeline behind a single BullMQ repeatable job (`news-poll`, every 30 min):

```
RSS + NewsData.io ──► dedupe + ticker-tag ──► embed (768 dims) ──► classify (sentiment via AIModule + ComplianceInterceptor) ──► persist + index ──► aggregate to Sentiment pillar (consumed by ScoringModule)
```

Every Gemini call (embeddings, sentiment) goes through the existing `AIModule` facade — `ComplianceInterceptor` wraps the sentiment classifier output, the embedding endpoint does not need sanitisation (no user-visible text) but uses the same private client. The Sentiment pillar input is published into the EOD recompute job's `ScoreInput` builder so the neutral fallback from Phase 3 is replaced by real news-driven values where coverage exists.

**Primary recommendation:** Build the `NewsModule` (ingest + storage + embed + index) and `SentimentModule` (classify + aggregate) as siblings. `NewsModule` owns Atlas Vector Search and exposes a read-only `getRecentForTicker(ticker, limit)` for the report UI and `getRecentEmbeddings(ticker, sinceDays)` for Phase 7's hybrid retrieval. `SentimentModule` owns the per-instrument rolling aggregate and the `ScoreInput.sentimentPillar.fromNews` writer that ScoringModule consumes.

---

## Standard Stack

### Core
| Library / Service | Version | Purpose | Why Standard |
|-------------------|---------|---------|--------------|
| `rss-parser` | `3.13.0` | RSS/Atom parsing for MoneyControl, ET, LiveMint, BSE/NSE feeds | [VERIFIED: `npm view rss-parser version` → 3.13.0]. Lightweight, well-typed, handles malformed XML. |
| `@google/genai` | `2.6.0` | Embeddings (`gemini-embedding-001`) + sentiment classification (`gemini-2.5-flash-lite`) | [VERIFIED: `npm view @google/genai version` → 2.6.0]. Already a project invariant — use the existing `AIModule.client` (private), never instantiate a second Gemini client. |
| `bullmq` | `5.77.6` | Repeatable `news-poll` job (every 30 min) + per-article processing fan-out | [VERIFIED: `npm view bullmq version` → 5.77.6]. Phase 3/4 already wired this; reuse `JobsModule`. |
| `mongoose` | `9.6.x` | `News` schema (Mongo Atlas) | [CITED: STACK.md] — locked. |
| MongoDB Atlas Vector Search | M10+ tier | `$vectorSearch` index over 768-dim embeddings | [CITED: mongodb.com/docs/atlas/atlas-vector-search] — Atlas-only feature; dedicated search nodes require **M10 or higher**; M0/Flex can prototype but are not production-suitable. |
| `axios` (existing) | as-installed | NewsData.io REST calls | Already in `DataIngestionModule` per Phase 2 stack. |

### Supporting
| Library / Pattern | Purpose | When to Use |
|-------------------|---------|-------------|
| `crypto.createHash('sha256')` (Node stdlib) | Content hash for dedup | Hash `(title + sourcePublisher)` lowercase+stripped for cross-source duplicate detection. |
| `date-fns` or `Intl.RelativeTimeFormat` | "2 hours ago" for the UI | Frontend; prefer `Intl.RelativeTimeFormat` (zero deps). |
| Existing `ComplianceInterceptor` (Phase 4) | Strip forbidden verbs from sentiment rationale | Mandatory on `AIModule.classifySentiment()` — see Code Example 3. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `rss-parser` | `feedparser` (older, callback-style) | `rss-parser` is the modern Promise-based standard; `feedparser` adds no benefit. |
| `gemini-2.5-flash-lite` for sentiment | `gemini-2.5-flash` | Flash-lite is `$0.10/1M in, $0.40/1M out`; Flash is `$0.30/1M in, $2.50/1M out` — ~6× cheaper on output; classification quality is comparable for 3-class polarity ([CITED: tokenmix.ai pricing comparison, May 2026]). Use Flash-lite. |
| NewsData.io | GNews / NewsAPI.org | NewsData.io has 200 credits/day free, 10 articles/credit (2000 articles/day cap), supports `country=in&category=business` ([CITED: newsdata.io/blog/newsdata-rate-limit]). GNews/NewsAPI free tiers are more restrictive. |
| Regex ticker matching | Aho-Corasick multi-pattern matcher | Aho-Corasick is faster on huge instrument masters; v1 has ~5000 stocks and ~30-min cadence — plain word-boundary regex over a precompiled `RegExp[]` is fine and trivially debuggable. |

**Installation (additions only — most already in repo from earlier phases):**

```bash
pnpm add rss-parser
# @google/genai, bullmq, mongoose, axios already installed
```

**Version verification (live, 2026-05-28):**
- `rss-parser` → `3.13.0` (`npm view rss-parser dist-tags.latest`) — [VERIFIED]
- `@google/genai` → `2.6.0` — [VERIFIED]
- `bullmq` → `5.77.6` — [VERIFIED]

---

## Architecture Patterns

### Project Structure (additions to existing `apps/api/src/`)

```
news/
├── news.module.ts
├── news.schema.ts             # Mongoose schema
├── news.repository.ts         # CRUD + $vectorSearch wrapper
├── news.service.ts            # public API: getRecentForTicker, getRecentEmbeddings
├── news.controller.ts         # GET /stocks/:ticker/news (public, materialised read)
├── ingest/
│   ├── rss.adapter.ts         # rss-parser wrapper, one feed → []NewsItem
│   ├── newsdata.adapter.ts    # NewsData.io HTTP client (existing axios + DataIngestionModule patterns)
│   ├── feed-registry.ts       # static array of {source, url, parser} — single source of truth
│   ├── dedup.ts               # canonical URL + sha256(title+source)
│   └── ticker-tagger.ts       # alias-set + word-boundary regex; LLM fallback for group ambiguity
├── vector/
│   ├── vector-index.spec.ts   # Atlas index JSON (used by infra-as-code or assertion at boot)
│   └── vector-index.assert.ts # runtime check: index exists & numDimensions===768
└── jobs/
    └── news-poll.processor.ts # BullMQ processor (repeatable, every 30min)

sentiment/
├── sentiment.module.ts
├── sentiment.service.ts       # callsAIModule.classifySentiment(); aggregates per-instrument
├── aggregator.ts              # rolling 30d, recency-decay + source-authority weighted
├── pillar-publisher.ts        # writes sentimentPillar.fromNews to ScoreInput builder
└── sentiment.types.ts         # SentimentLabel, SentimentRecord, AggregatePillarInput
```

### Pattern 1: Ingest → embed → classify → index → aggregate (the pipeline)

**What:** One BullMQ repeatable parent job (`news-poll`) fans out into per-source child jobs, each of which fans out into per-article jobs. Each per-article job is idempotent and short-lived:

```
news-poll (repeatable, cron */30 * * * *)
   ├─► child: ingest-rss:{source}   (per RSS feed)
   │       └─► child: process-article:{externalId}  (per item)
   │                  1. dedup-check (Mongo unique (source, externalId))
   │                  2. ticker-tag (regex over instrument master + LLM fallback)
   │                  3. embed (gemini-embedding-001, 768 dims, RETRIEVAL_DOCUMENT)
   │                  4. classify (gemini-2.5-flash-lite via AIModule → ComplianceInterceptor)
   │                  5. persist (single News doc, with embedding + sentiment + sentimentConfidence)
   │                  6. recompute-trigger (only if (instrument, day) sentiment shifted past threshold)
   └─► child: ingest-newsdata        (NewsData.io batch, same downstream)
```

**When to use:** Always. Fan-out idempotency means a Gemini 429 on one article doesn't block the others.

**Trade-offs:** + Per-article retry granularity, parallelism throttled per provider. − Slightly more BullMQ orchestration; mitigated by reusing the existing `JobsModule` pattern.

### Pattern 2: Read-only Atlas Vector Search index over `news.embedding`

**What:** Define the Atlas Vector Search index once, with filter fields for `instrumentMentions` and `publishedAt` so queries can pre-filter before kNN search. Phase 6 only inserts vectors; Phase 7 (Ask FinSight) does the hybrid retrieval — but the index must exist and `numDimensions: 768` must match `gemini-embedding-001`'s MRL-truncated output exactly.

**When to use:** Always. Index is built once at deploy; new docs are picked up automatically. Assert at app boot that the index exists with the correct dimension count.

**Trade-offs:** + Native, supports filter+vector in one stage. − Atlas-only (M10+ for prod). Index rebuilds are async and can take minutes on large collections; build before the first insert.

### Pattern 3: ComplianceInterceptor-wrapped sentiment classifier (chokepoint enforcement)

**What:** All sentiment calls go through `AIModule.classifySentiment(text)`, not through the raw Gemini client. The interceptor strips any forbidden verb ("buy", "sell", "recommend", "target", "should") from the `rationaleOneLine` before it ever lands in Mongo. If the rationale is non-empty after sanitisation, store it; if empty, store `null` and log.

**When to use:** Every classification, no exceptions. The raw `gemini.client.ts` is private behind `AIModule` (Phase 4 invariant).

### Pattern 4: Recency-decay + source-authority weighted aggregate → Sentiment pillar

**What:** Per instrument, compute a [0,10] pillar value from recent news:

```
polarity(label) = { POSITIVE: +1, NEUTRAL: 0, NEGATIVE: -1 }
w_i = exp(-age_hours_i / TAU) * sourceAuthority(source_i)
TAU = 168  // hours = 7 days half-life; tunable knob

raw = sum(w_i * polarity_i * confidence_i) / sum(w_i)   // in [-1, +1]
pillarValue = clamp(5 + 5 * raw, 0, 10)                 // map to [0, 10]
```

Source authority (initial table — tune empirically):
- MoneyControl, Economic Times, LiveMint, Business Standard: `1.0`
- BSE / NSE corporate announcements: `1.2` (primary-source disclosure)
- NewsData.io aggregated (unknown publisher): `0.6`

If `sum(w_i) === 0` (no qualifying news in the window) → return `null` so `ScoringModule` falls back to its Phase 3 neutral default.

**When to use:** Called by EOD recompute and by per-article processor when a sentiment shift exceeds threshold (see Pattern 5).

### Pattern 5: Selective recompute trigger

**What:** Don't recompute scores for every article. Track `(instrument, aggregateAsOf, pillarValue)` in Redis (TTL 36h). After a new article is persisted, recompute the aggregate; if `|new - cached| >= 0.5` (pillar points), enqueue a `score-recompute:{ticker}` job. Otherwise no-op. The nightly EOD job runs the aggregate fresh regardless, so missed micro-changes are absorbed by morning.

**When to use:** Per-article persist hook. Keeps the system event-driven without thundering-herd recomputes on every headline.

### Anti-Patterns to Avoid
- **Calling raw `gemini.client.generateContent()` for sentiment** — bypasses ComplianceInterceptor, fails the project invariant. Always go through `AIModule.classifySentiment()`.
- **Storing the article body verbatim** — copyright + storage; store title + description (RSS-provided summary) + URL. Pull-on-click for the full body if ever needed.
- **Synchronous Gemini in the news-feed GET** — the report's news section reads only the persisted `News` collection (Redis cache → Mongo). No live Gemini in any request path. Sentiment is materialised at ingest time.
- **Using `text-embedding-004`** — sunset 2026-01-14 (project invariant). Use `gemini-embedding-001` at 768 dims.
- **Persisting a `News` doc before classification succeeds** — better to persist with `sentiment: null` and a `classificationStatus: 'pending'` field, then update. This makes the UI show "Sentiment pending" rather than missing the article.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polarity classification of a news headline | A keyword/lexicon rule engine ("good"/"bad" word lists) | `gemini-2.5-flash-lite` via `AIModule.classifySentiment()` with response schema | Lexicon classifiers misread negation, sarcasm, financial jargon ("downgrade", "guidance cut") and require constant rule maintenance. The cost per article at Flash-Lite + batch is ~$0.0001 — cheaper than the rule-maintenance hours. |
| Vector similarity search | A Mongo aggregation with $reduce / hand-rolled cosine | Atlas `$vectorSearch` aggregation stage | Native indexed kNN over HNSW; orders of magnitude faster; supports `filter` for pre-filtering by instrument + recency. |
| Embedding model | Sentence-Transformers (Python) or OpenAI embeddings | `gemini-embedding-001` (project invariant; same vendor key, MRL truncation) | Single vendor reduces ops surface; MRL truncation to 768 keeps the index ~4× smaller than 3072 with minimal quality loss. |
| RSS parsing | DIY XML walker | `rss-parser 3.13` | Handles RSS 0.9/1.0/2.0/Atom, malformed entities, GUIDs, dates, namespaces. |
| Sentiment aggregation over time | A scheduled SQL window or custom loop | A small pure function called by the EOD job (Pattern 4) + Redis cache | Aggregate is cheap; the discipline is `pure function + clear formula + tunable knob` — testable and audit-friendly. |
| Ticker disambiguation when "Adani" matches 4 group companies | Brittle regex priority list | LLM fallback: structured prompt → `gemini-2.5-flash-lite` "which of these instruments does this headline discuss?" with `responseSchema: { instrumentIds: ['enum...'] }`; or store **no** mention if ambiguous and confidence < threshold | Pure regex over-attributes; over-attribution corrupts the pillar input. See Pitfall 1. |

**Key insight:** Every "novel" component in this phase already has a canonical solution. Phase 6 is integration, not invention. The only domain-specific code is (a) the ticker tagger and (b) the pillar aggregator.

---

## Common Pitfalls

### Pitfall 1: Hallucinated/over-broad ticker tagging ("ADANI overmatched")
**What goes wrong:** A headline "Adani Group denies Hindenburg allegations" matches `ADANIENT`, `ADANIPORTS`, `ADANIGREEN`, `ADANIPOWER`, `ATGL`, `AWL`, etc. — and the article gets credited to all of them, polluting every Adani-stock sentiment aggregate.
**Why it happens:** Naïve substring or even word-boundary regex over the instrument master treats every alias hit as a confirmed mention.
**How to avoid:**
1. Per instrument, precompute an alias set: `[official long name, NSE symbol, BSE symbol, well-known short forms (≥4 chars), former names]`. **Exclude** parent-group brand tokens ("Adani", "Tata", "Reliance", "Bajaj") unless they uniquely identify exactly one instrument in the master.
2. Match with `\b<alias>\b` (word boundary), case-insensitive.
3. If 2+ instruments under the same parent group match → **don't** store a `(news, instrument)` mention from the regex. Enqueue an LLM-tag fallback: `gemini-2.5-flash-lite` with a structured `responseSchema: { mentions: { instrumentId, confidence }[] }`. Store only mentions with confidence ≥ 0.75.
4. If still ambiguous and no clear single instrument → tag the article as `groupLevel: 'ADANI'` (a separate field) and exclude from per-instrument sentiment aggregates. UI can still show it under a "Group news" tab.

**Warning signs:** One headline showing up on > 3 instruments' news feeds; sentiment pillar swings of > 1 point on a benign group-wide story.

### Pitfall 2: Vector index `numDimensions` mismatch silently corrupts queries
**What goes wrong:** Atlas index defined with `numDimensions: 1536`, but the SDK call uses default 3072 or omits truncation — Mongo silently accepts the wrong-size vector at insert and queries return garbage or error at retrieval time.
**Why it happens:** `gemini-embedding-001` defaults to 3072 dims; you must explicitly pass `outputDimensionality: 768`. Atlas does not validate vector length at insert time.
**How to avoid:**
1. Hard-code `OUTPUT_DIM = 768` as a module constant; reference it in both the embed call and the index assertion.
2. At app boot, assert: `db.runCommand({ listSearchIndexes: 'news' })` returns an index whose `fields[0].numDimensions === 768`. Fail loudly (refuse to start) on mismatch.
3. In tests, embed a sentence and assert `embedding.length === 768`.

**Warning signs:** Vector search returns empty / nonsensical results; deploy-time embedding length differs from index definition.

### Pitfall 3: Sentiment label bypassing ComplianceInterceptor
**What goes wrong:** A developer imports `gemini.client.ts` directly (or duplicates a Gemini client in `sentiment/`) to "simplify" sentiment classification. The rationale field contains "Strong BUY signal" and lands in Mongo, then surfaces in the report UI.
**Why it happens:** Convenience; the AIModule facade feels indirect.
**How to avoid:**
1. `gemini.client.ts` is `private` (not exported from `ai.module.ts`). Lint rule (ESLint `no-restricted-imports`) blocks imports of `gemini.client` from outside `ai/`.
2. `AIModule` exposes `classifySentiment(text): Promise<{label, confidence, rationale}>` — this is the only API SentimentModule may use.
3. Code review checklist: any new Gemini import must be inside `ai/`.

**Warning signs:** Compliance-prohibited words appearing in stored `News.sentimentRationale`; new files outside `ai/` importing from `@google/genai`.

### Pitfall 4: RSS feed schema drift
**What goes wrong:** A publisher renames a tag, drops `guid`, or moves to JSON Feed. `rss-parser` returns items with `undefined` titles or URLs; downstream embed/classify calls fail or store garbage.
**Why it happens:** RSS is loosely contracted; publishers change without notice.
**How to avoid:**
1. Validate every parsed item with a strict DTO (`class-validator`): `{ title: string, link: string, isoDate: string, contentSnippet?: string, guid: string }`. Reject items missing required fields.
2. **Boot-time live probe**: on `news-poll` worker startup, fire a single `HEAD` (or 1-item parse) against each registered feed URL. If any returns 4xx/5xx or yields zero valid items, log a structured `ERROR` with `{ source, url, status }` and a metric `news.feed.probe.failed{source}`. Don't crash — degrade.
3. Per-source success metric per poll cycle; alert when a source drops to 0 items for > 4 consecutive cycles (2 hours).
4. URLs marked `[ASSUMED]` below MUST trigger this probe before any production deploy.

**Warning signs:** Suddenly zero articles from one source; rising rate of validation rejections.

### Pitfall 5: Sentiment cache becomes "permanently wrong" after a model upgrade
**What goes wrong:** Classifications are cached "permanently" (the article doesn't change). Months later, `gemini-2.5-flash-lite` is replaced by `gemini-3.0-flash-lite` which produces materially different labels — but cached results from the old model dominate the aggregate.
**Why it happens:** Cache key omits the classifier identity.
**How to avoid:**
- Cache key: `sentiment:${articleId}:${classifierModel}:${classifierVersion}`. Store `classifierModel` and `classifierVersion` on the `News` doc. On model swap, a backfill job re-classifies (it's cheap with Flash-Lite + Batch API at 50% discount → ~$0.05/$0.20 per 1M tokens [CITED: blog.galaxy.ai pricing 2026]).

**Warning signs:** Pillar values drift in unison across all instruments after a deploy.

### Pitfall 6: NewsData.io credit exhaustion mid-day
**What goes wrong:** Free tier = 200 credits/day, 10 articles/credit; aggressive polling burns it by noon, then the source goes silent.
**Why it happens:** Polling every 30 min × business category × country=in × language=en uses ~1 credit per poll × 48 polls = ~48 credits/day baseline, but pagination and country switches multiply this. [CITED: newsdata.io/blog/newsdata-rate-limit]
**How to avoid:**
1. Cap NewsData.io polling at every 60 min (48 → 24 polls/day).
2. Track remaining credits from the response headers; circuit-break at < 20 remaining.
3. Treat RSS as primary; NewsData.io as enrichment (one extra source).

**Warning signs:** NewsData.io 429s; daily article counts dropping after ~12:00 IST.

### Pitfall 7: Embedding rate limits during backfill
**What goes wrong:** Backfilling embeddings for thousands of historical articles in one burst hits Gemini RPM limits; the job dies; partial state.
**How to avoid:**
- Use the Batch API for backfills (50% discount, async).
- For live ingest, throttle to a known safe RPM (start conservative — e.g., 60 RPM — and ramp).
- Per-article processor sets BullMQ `concurrency: 4` and `rateLimit: { max: 30, duration: 1000 }`.

---

## Runtime State Inventory

**Skipped.** This is a greenfield phase (new collection, new index, new module). No existing rename/refactor surface to inventory.

---

## Code Examples

### Example 1: Atlas Vector Search index definition

```typescript
// apps/api/src/news/vector/vector-index.spec.ts
// Source: https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-type/
// Apply via Atlas UI, mongosh, or atlas-cli; the assertion below verifies at boot.

export const NEWS_VECTOR_INDEX_NAME = 'news_embedding_idx';
export const NEWS_EMBEDDING_DIM = 768;

export const newsVectorIndex = {
  name: NEWS_VECTOR_INDEX_NAME,
  type: 'vectorSearch',
  definition: {
    fields: [
      {
        type: 'vector',
        path: 'embedding',
        numDimensions: NEWS_EMBEDDING_DIM,
        similarity: 'cosine',
      },
      { type: 'filter', path: 'instrumentMentions' },
      { type: 'filter', path: 'publishedAt' },
      { type: 'filter', path: 'source' },
    ],
  },
};
```

```typescript
// apps/api/src/news/vector/vector-index.assert.ts
import { Connection } from 'mongoose';
import { NEWS_VECTOR_INDEX_NAME, NEWS_EMBEDDING_DIM } from './vector-index.spec';

export async function assertNewsVectorIndex(conn: Connection): Promise<void> {
  const indexes = await conn.db
    .collection('news')
    .aggregate([{ $listSearchIndexes: { name: NEWS_VECTOR_INDEX_NAME } }])
    .toArray();
  const idx = indexes[0];
  if (!idx) {
    throw new Error(`Atlas Vector Search index '${NEWS_VECTOR_INDEX_NAME}' not found on 'news'. Create it before starting.`);
  }
  const vecField = idx.latestDefinition?.fields?.find((f: any) => f.type === 'vector');
  if (vecField?.numDimensions !== NEWS_EMBEDDING_DIM) {
    throw new Error(
      `Vector index dim mismatch: expected ${NEWS_EMBEDDING_DIM}, found ${vecField?.numDimensions}. ` +
      `Embedding model and index must agree.`,
    );
  }
}
```

### Example 2: `$vectorSearch` query (filter by instrument + recency)

```typescript
// apps/api/src/news/news.repository.ts
// Source: https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-stage/

async semanticSearch(opts: {
  queryVector: number[];          // length === 768
  instrumentId: string;
  sinceDays?: number;             // default 30
  numCandidates?: number;         // default 200
  limit?: number;                 // default 10
}) {
  const since = new Date(Date.now() - (opts.sinceDays ?? 30) * 86_400_000);
  return this.newsModel.aggregate([
    {
      $vectorSearch: {
        index: NEWS_VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector: opts.queryVector,
        numCandidates: opts.numCandidates ?? 200,
        limit: opts.limit ?? 10,
        filter: {
          instrumentMentions: opts.instrumentId,
          publishedAt: { $gte: since },
        },
      },
    },
    {
      $project: {
        _id: 1, title: 1, url: 1, source: 1, publishedAt: 1,
        sentiment: 1, sentimentConfidence: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ]);
}
```

> **Phase-7 note:** Hybrid retrieval (`$rankFusion` combining `$vectorSearch` + `$search` keyword) is the right pattern for Ask FinSight, but it's a Phase-7 deliverable. Phase 6 only needs the vector index to **exist** and to be **populated**. `$rankFusion` requires MongoDB **8.0+** ([CITED: mongodb.com/docs/atlas/atlas-vector-search/hybrid-search]) — confirm Atlas cluster version when Phase 7 begins.

### Example 3: Gemini structured-output sentiment classification (via AIModule — interceptor-wrapped)

```typescript
// apps/api/src/ai/ai.service.ts (additive — does NOT touch the private gemini.client)
// Source: https://ai.google.dev/gemini-api/docs/structured-output
import { Type } from '@google/genai';

const SENTIMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    sentiment:           { type: Type.STRING, enum: ['POSITIVE', 'NEGATIVE', 'NEUTRAL'] },
    confidence:          { type: Type.NUMBER }, // 0..1
    rationaleOneLine:    { type: Type.STRING },
  },
  required: ['sentiment', 'confidence', 'rationaleOneLine'],
};

const SYSTEM_INSTRUCTION = `
You are a financial-news sentiment classifier for Indian retail-investor analysis.
Classify the headline's sentiment toward the COMPANY/INSTRUMENT mentioned.
Constraints (HARD):
- Output MUST be POSITIVE, NEGATIVE, or NEUTRAL.
- rationaleOneLine MUST be ≤ 20 words, factual, no investment advice.
- NEVER use the words: buy, sell, recommend, target, should, must, will rise, will fall.
- This is analysis, not advice.
`;

@Injectable()
export class AiService {
  // ComplianceInterceptor wraps the controller/service boundary; classify() returns
  // through that pipe so any forbidden token in rationaleOneLine is stripped before persistence.
  @UseInterceptors(ComplianceInterceptor)
  async classifySentiment(text: string): Promise<SentimentResult> {
    const res = await this.gemini.models.generateContent({   // private client, internal-only
      model: 'gemini-2.5-flash-lite',
      contents: text,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: SENTIMENT_SCHEMA,
        temperature: 0.0,
      },
    });
    return JSON.parse(res.text) as SentimentResult;
  }
}
```

```typescript
// Caller — SentimentModule — never touches gemini directly.
const result = await this.aiService.classifySentiment(`${title}. ${description ?? ''}`.trim());
// result is post-ComplianceInterceptor; result.rationaleOneLine is sanitised.
await this.newsRepo.update(articleId, {
  sentiment: result.sentiment,
  sentimentConfidence: result.confidence,
  sentimentRationale: result.rationaleOneLine || null,
  classifierModel: 'gemini-2.5-flash-lite',
  classifierVersion: GEMINI_CLASSIFIER_VERSION,  // bump on model swap → triggers re-classify
});
```

### Example 4: Embedding call (RETRIEVAL_DOCUMENT, 768 dims)

```typescript
// apps/api/src/ai/ai.service.ts
// Source: https://ai.google.dev/gemini-api/docs/embeddings

async embedForStorage(text: string): Promise<number[]> {
  const res = await this.gemini.models.embedContent({
    model: 'gemini-embedding-001',
    contents: text,
    config: {
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: 768,   // MUST match Atlas index numDimensions
    },
  });
  const vec = res.embeddings[0].values;
  if (vec.length !== 768) {
    throw new Error(`Embedding dim mismatch: ${vec.length} (expected 768)`);
  }
  return vec;
}

// For search queries (Phase 7):
async embedForQuery(text: string): Promise<number[]> {
  const res = await this.gemini.models.embedContent({
    model: 'gemini-embedding-001',
    contents: text,
    config: { taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768 },
  });
  return res.embeddings[0].values;
}
```

### Example 5: `News` Mongoose schema

```typescript
// apps/api/src/news/news.schema.ts
@Schema({ collection: 'news', timestamps: { createdAt: 'fetchedAt', updatedAt: false } })
export class News {
  @Prop({ required: true, index: true })             source!: string;          // 'moneycontrol' | 'et-markets' | 'newsdata-io' | ...
  @Prop({ required: true })                          externalId!: string;       // RSS guid OR canonical URL hash
  @Prop({ required: true })                          url!: string;
  @Prop({ required: true })                          canonicalUrl!: string;     // url with tracking params stripped — used for cross-source dedup
  @Prop({ required: true })                          contentHash!: string;      // sha256(title|source) for fuzzy dedup
  @Prop({ required: true })                          title!: string;
  @Prop()                                            description?: string;
  @Prop({ required: true, index: true })             publishedAt!: Date;
  @Prop({ type: [String], default: [], index: true }) instrumentMentions!: string[];   // instrumentIds (canonical from instrument master)
  @Prop({ type: [Number], default: undefined })       embedding?: number[];     // length 768
  @Prop({ default: 'gemini-embedding-001' })          embeddingModel?: string;
  @Prop({ default: '1' })                             embeddingVersion?: string;
  @Prop({ enum: ['POSITIVE','NEGATIVE','NEUTRAL', null], default: null })
                                                     sentiment?: 'POSITIVE'|'NEGATIVE'|'NEUTRAL'|null;
  @Prop({ min: 0, max: 1 })                          sentimentConfidence?: number;
  @Prop()                                            sentimentRationale?: string;
  @Prop()                                            classifierModel?: string;
  @Prop()                                            classifierVersion?: string;
  @Prop({ enum: ['pending','classified','failed'], default: 'pending', index: true })
                                                     classificationStatus!: string;
}

export const NewsSchema = SchemaFactory.createForClass(News);
NewsSchema.index({ source: 1, externalId: 1 }, { unique: true });
NewsSchema.index({ instrumentMentions: 1, publishedAt: -1 });
NewsSchema.index({ publishedAt: -1 });
// TTL: 90 days hot retention; cold-archive older via separate job (out of phase scope, see Open Q3)
NewsSchema.index({ publishedAt: 1 }, { expireAfterSeconds: 90 * 86400 });
```

### Example 6: Sentiment pillar aggregation

```typescript
// apps/api/src/sentiment/aggregator.ts — PURE, easy to unit test
const TAU_HOURS = 168;  // 7-day half-life — knob
const SOURCE_AUTHORITY: Record<string, number> = {
  'bse-announcements':   1.2,
  'nse-announcements':   1.2,
  'moneycontrol':        1.0,
  'et-markets':          1.0,
  'livemint':            1.0,
  'business-standard':   1.0,
  'newsdata-io':         0.6,
};
const POLARITY = { POSITIVE: +1, NEUTRAL: 0, NEGATIVE: -1 } as const;

export function aggregateSentimentPillar(
  items: Array<{ source: string; sentiment: 'POSITIVE'|'NEGATIVE'|'NEUTRAL'; confidence: number; publishedAt: Date }>,
  asOf: Date,
): number | null {
  if (items.length === 0) return null;
  let num = 0, den = 0;
  for (const it of items) {
    const ageH = Math.max(0, (asOf.getTime() - it.publishedAt.getTime()) / 3_600_000);
    const w = Math.exp(-ageH / TAU_HOURS) * (SOURCE_AUTHORITY[it.source] ?? 0.5);
    num += w * POLARITY[it.sentiment] * (it.confidence ?? 1);
    den += w;
  }
  if (den === 0) return null;
  const raw = num / den;                       // [-1, +1]
  return Math.max(0, Math.min(10, 5 + 5 * raw));
}
```

### Example 7: Frontend news feed (contract sketch — planner expands)

```tsx
// apps/web/src/app/stock/[ticker]/components/NewsFeed.tsx (RSC + Suspense)
// API: GET /api/stocks/:ticker/news?limit=10  →  NewsItem[]
type NewsItem = {
  id: string; title: string; url: string; source: string;
  publishedAt: string;   // ISO
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | null;
};

const SENTIMENT_BADGE = {
  POSITIVE: 'bg-emerald-100 text-emerald-800',
  NEGATIVE: 'bg-rose-100 text-rose-800',
  NEUTRAL:  'bg-zinc-100 text-zinc-700',
} as const;

export function NewsItemRow({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 py-2"
    >
      {item.sentiment && (
        <span className={`px-2 py-0.5 text-xs rounded ${SENTIMENT_BADGE[item.sentiment]}`}>
          {item.sentiment.toLowerCase()}
        </span>
      )}
      <div>
        <p className="text-sm">{item.title}</p>
        <p className="text-xs text-zinc-500">
          {item.source} · <RelativeTime iso={item.publishedAt} />
        </p>
      </div>
    </a>
  );
}
// Disclaimer footer: "Sentiment is analysis, not advice. Past performance ≠ future results."
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `text-embedding-004` (768/1536) | `gemini-embedding-001` @ 768 (MRL-truncated from 3072) | 2026-01-14 (sunset) | Project invariant; use `outputDimensionality: 768`. |
| Lexicon/SVM sentiment | Small LLM (Flash-Lite) with structured output | Mainstream by 2025 | Cheaper than maintenance of rule sets; handles negation/jargon. |
| Manual `$search` + `$vectorSearch` union with custom scoring | `$rankFusion` (RRF) | MongoDB 8.0 GA (2025) | Phase 7 (Ask FinSight) — not Phase 6. |
| `gemini-2.5-flash` for sentiment | `gemini-2.5-flash-lite` (GA) | 2025 | 6× cheaper output; comparable quality on 3-class classification. |

**Deprecated/outdated:**
- `text-embedding-004` — sunset 2026-01-14, do not use.
- `@google/generative-ai` — deprecated, use `@google/genai`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MoneyControl official RSS URLs follow `https://www.moneycontrol.com/rss/{section}.xml` (e.g., `business.xml`, `MCtopnews.xml`, `marketreports.xml`, `latestnews.xml`, `iponews.xml`) | A (RSS sources) — see "Verified RSS Feed Inventory" below | Wrong URL → 404, source silently drops. **Mitigation:** boot-time live probe (Pitfall 4) catches this immediately. |
| A2 | LiveMint feed URLs: `https://www.livemint.com/rss/markets`, `/rss/companies`, `/rss/money` | A | Same as A1; probe catches at boot. |
| A3 | Business Standard feed URLs: `https://www.business-standard.com/rss/markets-106.rss` and `/rss/companies-101.rss` (pattern observed in feedspot listings; not verified by direct fetch) | A | Same as A1; probe catches at boot. |
| A4 | BSE corporate announcement RSS exists at `https://www.bseindia.com/data/xml/notices.xml` (or equivalent — BSE confirmed RSS section exists per nseindia.com/static/rss-feed and beta.bseindia.com/rss-feed.html, but I did not verify exact paths) | A | Plan should include a research task: open BSE RSS page in a browser at scaffold time and capture exact URLs; until then, treat BSE/NSE corporate-announcement ingestion as v1.1 nice-to-have, not a Phase-6 blocker. |
| A5 | `gemini-2.5-flash-lite` structured-output `responseSchema` works in the v2.6 SDK exactly as documented for `gemini-2.5-flash` | E (sentiment) | Run a Wave-0 smoke test (`classifySentiment("Tata Motors profit jumps 30%")` → POSITIVE) to confirm; pivot to `gemini-2.5-flash` if structured output fails on flash-lite. |
| A6 | NewsData.io's `?country=in&category=business&language=en` returns useful coverage at the free-tier 200-credits/day budget | A | Probe after first day of polling; if useful articles/day < ~20, treat NewsData.io as cosmetic and rely on RSS only. |
| A7 | Source-authority weights (MoneyControl/ET/Mint/BS = 1.0, BSE/NSE = 1.2, NewsData = 0.6) are reasonable initial values | F (aggregator) | Worst case: pillar values drift toward one source's bias. Tunable knob — surface in admin config, not hardcoded. |
| A8 | `tau = 168 hours` (7-day half-life) is a sensible recency-decay constant | F | Same as A7 — tunable knob. |
| A9 | A pillar-value shift of `≥ 0.5` is the right threshold to trigger an inter-EOD score recompute | Pattern 5 | Too sensitive → thundering recomputes; too lax → stale scores during news events. Start at 0.5, instrument and tune. |
| A10 | 90-day hot retention via TTL index meets product needs | Schema | If product wants longer history for trend charts, raise TTL or move to a cold-archive collection. Decision belongs in discuss-phase. |

**Live-verified (NOT assumed):**
- Economic Times RSS URLs (`/markets/rssfeeds/1977021501.cms`, `/markets/stocks/rssfeeds/2146842.cms`, `/mf/rssfeeds/359241701.cms`, `/News/rssfeeds/1715249553.cms`) — [CITED: feedspot.com/the_economic_times_rss_feeds].
- `rss-parser@3.13.0`, `@google/genai@2.6.0`, `bullmq@5.77.6` — [VERIFIED: npm view].
- `gemini-embedding-001` supports MRL truncation; recommended dims 768/1536/3072; default 3072 — [CITED: ai.google.dev/gemini-api/docs/embeddings, developers.googleblog.com].
- `text-embedding-004` sunset 2026-01-14 — [CITED: project invariants, ai.google.dev migration guide].
- Atlas Vector Search requires Atlas (not Community); dedicated Search Nodes need M10+; M0/Flex supports prototyping only — [CITED: mongodb.com/docs/atlas/atlas-vector-search/deployment-options].
- `$rankFusion` is MongoDB 8.0+ — [CITED: mongodb.com/community/forums "Announcing Hybrid Search support via $rankFusion"].
- `gemini-2.5-flash-lite` pricing: $0.10/1M in, $0.40/1M out; Flash: $0.30/$2.50 — [CITED: tokenmix.ai, toolkitbyai.com — 2026].
- NewsData.io free tier: 200 credits/day, 10 articles/credit, 30 credits/15min rate limit — [CITED: newsdata.io/blog/newsdata-rate-limit].

### Verified RSS Feed Inventory (initial — confirm at deploy via boot-time probe)

```
# [CITED: feedspot] — Economic Times (high confidence)
ET Markets:    https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms
ET Stocks:     https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms
ET MF:         https://economictimes.indiatimes.com/mf/rssfeeds/359241701.cms
ET MF News:    https://economictimes.indiatimes.com/mf/mf-news/rssfeeds/1107225967.cms
ET News:       https://economictimes.indiatimes.com/News/rssfeeds/1715249553.cms
ET Company:    https://economictimes.indiatimes.com/news/company/rssfeeds/2143429.cms
ET Industry:   https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms
ET IPO:        https://economictimes.indiatimes.com/markets/ipos/fpos/rssfeeds/14655708.cms

# [ASSUMED] — MoneyControl (URL pattern observed; verify at boot)
MC Top News:   https://www.moneycontrol.com/rss/MCtopnews.xml
MC Business:   https://www.moneycontrol.com/rss/business.xml
MC Market Rep: https://www.moneycontrol.com/rss/marketreports.xml
MC Latest:     https://www.moneycontrol.com/rss/latestnews.xml
MC IPO:        https://www.moneycontrol.com/rss/iponews.xml
MC MF:         https://www.moneycontrol.com/rss/mutualfunds.xml

# [ASSUMED] — LiveMint
Mint Markets:    https://www.livemint.com/rss/markets
Mint Companies:  https://www.livemint.com/rss/companies
Mint Money:      https://www.livemint.com/rss/money

# [ASSUMED] — Business Standard (verify at https://www.business-standard.com/rss-feeds/listing in a browser)
BS Markets:    https://www.business-standard.com/rss/markets-106.rss
BS Companies:  https://www.business-standard.com/rss/companies-101.rss

# [ASSUMED — DEFER to v1.1 unless captured manually in a browser]
BSE Corporate Announcements: see https://beta.bseindia.com/rss-feed.html
NSE Corporate Announcements: see https://www.nseindia.com/static/rss-feed
```

---

## Open Questions

1. **Retention policy — 90 days enough?**
   - What we know: TTL of 90 days fits a quarterly news-cycle view.
   - What's unclear: Does the product want a 1-year trend view ("sentiment over time")? If so, 90d is too short for the time-series, even if individual articles can age out.
   - Recommendation: Persist a derived `sentiment_daily_aggregate` collection (per instrument, per day) with longer retention (e.g., 5 years). Articles age out at 90d; aggregates persist. Add as a Phase-6 task or defer to Phase 7.

2. **Cold archive for older news?**
   - Defer to /gsd-discuss-phase. Plain TTL drop is the v1 default.

3. **Sentiment shifts and SEBI compliance — does an automatically-tagged "NEGATIVE" sentiment label on a public news item count as an unregistered research recommendation?**
   - Recommendation: Treat the sentiment chip as analysis (already covered by the project-wide "analysis not advice" disclaimer); never aggregate it into a written verdict like "negative news suggests caution" without ComplianceInterceptor sanitisation. The pillar feeds a number, not a verb. Confirm with the compliance discussion in discuss-phase.

4. **BSE/NSE corporate announcement feed exact URLs.**
   - Resolve via a manual browser visit at Wave 0; not a Phase-6 blocker (other 4 sources give adequate coverage for NEWS-01..03 acceptance).

5. **Should the news feed render for mutual funds too?**
   - Phase 6 scope per ROADMAP.md says "each stock report" — NEWS-01 says "for a stock". Fund news coverage is not in scope this phase. Defer to v1.1.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| MongoDB Atlas **M10+ tier** with Vector Search enabled | NEWS-03 (vector index), and necessary for `$vectorSearch` in production | **MUST verify before phase starts** | — | **None** — M0/Flex prototyping only; production needs M10+. See Pitfall: this is the single hardest dependency in the phase. |
| `@google/genai` Gemini API key with embedding + flash-lite quota | NEWS-02, NEWS-03 | Assumed (from Phase 4 setup) | — | None — phase cannot ship without Gemini. |
| Redis 7.x (BullMQ + sentiment cache) | All ingest jobs | Assumed (from Phase 1) | — | None. |
| Outbound HTTPS to: `economictimes.indiatimes.com`, `moneycontrol.com`, `livemint.com`, `business-standard.com`, `bseindia.com`, `nseindia.com`, `newsdata.io`, `generativelanguage.googleapis.com` | Ingest + AI | Assumed (no egress restrictions documented) | — | If a host is blocked: drop source, log, continue. |
| NewsData.io API key (free tier OK) | Enrichment source | Optional; degrades to RSS-only if absent | — | Skip the adapter; warn at boot. |
| MongoDB **8.0+** (for `$rankFusion`) | **Phase 7 only**, not Phase 6 | Verify when Phase 7 starts | — | Use manual two-pipeline union + RRF in code. |

**Missing dependencies with no fallback:**
- **MongoDB Atlas M10+ tier** — if currently on M0/Flex, this phase is blocked until upgrade. Surface this as the first task in Wave 0.

**Missing dependencies with fallback:**
- NewsData.io key — skip enrichment, RSS-only.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (NestJS default — already used in Phases 1–5) |
| Config file | `apps/api/test/jest.config.ts` (existing) |
| Quick run command | `pnpm --filter api test -- news sentiment` |
| Full suite command | `pnpm --filter api test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NEWS-01 | `GET /stocks/:ticker/news` returns the last N items for an instrument with valid mentions | integration | `pnpm --filter api test -- news.controller.spec` | ❌ Wave 0 |
| NEWS-01 | News feed component renders 10 items with title/source/relative-time/badge | unit (web) | `pnpm --filter web test -- NewsFeed.test` | ❌ Wave 0 |
| NEWS-02 | `AiService.classifySentiment("Tata Motors profit jumps 30%")` returns `POSITIVE` with confidence ≥ 0.6 | smoke (live Gemini) | `pnpm --filter api test:smoke -- sentiment.smoke` | ❌ Wave 0 |
| NEWS-02 | ComplianceInterceptor strips forbidden verbs from `rationaleOneLine` (e.g., synthetic "Strong BUY signal" → "Strong signal") | unit | `pnpm --filter api test -- compliance.interceptor.spec` | partial (Phase 4 owns the interceptor; this phase adds sentiment-specific cases) |
| NEWS-02 | A `News` doc never persists with `sentimentRationale` containing forbidden tokens | integration | `pnpm --filter api test -- news.persist.spec` | ❌ Wave 0 |
| NEWS-03 | At app boot, `assertNewsVectorIndex` throws if the index is missing or `numDimensions !== 768` | unit | `pnpm --filter api test -- vector-index.assert.spec` | ❌ Wave 0 |
| NEWS-03 | `embedForStorage("text")` returns a 768-length number array | smoke (live Gemini) | `pnpm --filter api test:smoke -- embedding.smoke` | ❌ Wave 0 |
| NEWS-03 | `newsRepository.semanticSearch({...})` returns hits filtered by `instrumentMentions` and `publishedAt >= since` | integration (testcontainer or staging Atlas) | `pnpm --filter api test:integration -- semantic-search` | ❌ Wave 0 |
| NEWS-04 | `aggregateSentimentPillar([])` returns `null` (so ScoringModule falls back to neutral) | unit | `pnpm --filter api test -- aggregator.spec` | ❌ Wave 0 |
| NEWS-04 | `aggregateSentimentPillar([positive×3])` returns a value > 5; `[negative×3]` returns < 5 | unit | (same file) | ❌ Wave 0 |
| NEWS-04 | EOD recompute consumes `sentimentPillar.fromNews` when non-null; otherwise uses neutral | integration | `pnpm --filter api test:integration -- score-input-builder.spec` | ❌ Wave 0 |
| Pitfall 1 | Ticker tagger does NOT attribute "Adani Group denies allegations" to all 6 Adani instruments | unit | `pnpm --filter api test -- ticker-tagger.spec` | ❌ Wave 0 |
| Pitfall 4 | News-poll worker boot probe logs ERROR with `{source, url, status}` when a feed returns 404 | integration | `pnpm --filter api test:integration -- feed-probe.spec` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter api test -- news sentiment` (~few seconds, pure unit + interceptor specs)
- **Per wave merge:** `pnpm --filter api test && pnpm --filter web test` (full suite, includes integration)
- **Phase gate:** Full suite green + a one-shot live-Gemini smoke (`pnpm --filter api test:smoke`) + a manual end-to-end check (poll → see ≥ 1 sentiment-tagged article in a known-ticker report)

### Wave 0 Gaps
- [ ] `apps/api/src/news/news.controller.spec.ts` — covers NEWS-01
- [ ] `apps/api/src/news/news.persist.spec.ts` — covers NEWS-02 (compliance enforcement at persist boundary)
- [ ] `apps/api/src/news/ingest/ticker-tagger.spec.ts` — covers Pitfall 1
- [ ] `apps/api/src/news/vector/vector-index.assert.spec.ts` — covers NEWS-03 (dim mismatch)
- [ ] `apps/api/src/news/jobs/feed-probe.spec.ts` — covers Pitfall 4
- [ ] `apps/api/src/sentiment/aggregator.spec.ts` — covers NEWS-04 (pure aggregation)
- [ ] `apps/api/test/smoke/sentiment.smoke.ts` — covers NEWS-02 live-Gemini smoke
- [ ] `apps/api/test/smoke/embedding.smoke.ts` — covers NEWS-03 dim check against live Gemini
- [ ] `apps/api/test/integration/semantic-search.spec.ts` — covers NEWS-03 against staging Atlas
- [ ] `apps/api/test/integration/score-input-builder.spec.ts` — covers NEWS-04 wiring into ScoringModule
- [ ] `apps/web/src/app/stock/[ticker]/components/NewsFeed.test.tsx` — covers NEWS-01 UI contract

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no new auth surface — reuses Phase 1 JWT) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (read-only public-news endpoint vs. auth-gated mutation) | NestJS guard: read endpoint public; no write endpoint exposed (writes are job-only). |
| V5 Input Validation | yes | `class-validator` DTOs on parsed RSS items and NewsData.io responses; reject malformed; whitelist external fields. Per platform rule: `whitelist: true` strips unknowns. |
| V6 Cryptography | yes | `crypto.createHash('sha256')` (Node stdlib) for content hash. NEVER roll a custom hash. |
| V7 Error Handling & Logging | yes | Structured logger; never log full article body if PII appears; do log `(source, url, status)` on failures. |
| V8 Data Protection | yes | DPDP: news articles are public data, no PII. Atlas-Mumbai residency continues to apply per project invariant. |
| V10 Malicious Code | yes | `target="_blank" rel="noopener noreferrer"` mandatory on every external news link in the UI (prevents reverse tabnabbing). |
| V14 Configuration | yes | NewsData.io key + Gemini key from env / secret manager. **No hardcoded keys** (platform MUST rule). |

### Known Threat Patterns for the news/embedding/sentiment stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Reverse tabnabbing via news click-through | Tampering | `rel="noopener noreferrer"` + `target="_blank"` |
| Prompt injection inside a news headline → influences sentiment label | Tampering | (a) Strict `responseSchema` constrains output to enum + number + bounded string; (b) ComplianceInterceptor strips forbidden verbs from `rationaleOneLine`; (c) headline text is enclosed in a quoted-context delimiter in the prompt. |
| Atlas index DoS via huge `numCandidates` | DoS | Cap `numCandidates` at 500 server-side; ignore client-supplied values on the public endpoint. |
| Stored XSS from an RSS title with HTML in it | Tampering / Stored XSS | RSC renders text content as string (React escapes by default); never use `dangerouslySetInnerHTML` on news content. |
| Secret leakage in logs (Gemini key, NewsData key) | Info Disclosure | Logger redacts known secret prefixes; never log full request URLs that may contain `apikey=` query params (NewsData.io). |
| Source spoofing — a malicious RSS server impersonates a publisher | Spoofing | All feed URLs are hardcoded in `feed-registry.ts` (no dynamic URLs); HTTPS required; reject `http://`. |

---

## Sources

### Primary (HIGH confidence)
- npm registry live query (2026-05-28) — `rss-parser` 3.13.0, `@google/genai` 2.6.0, `bullmq` 5.77.6 — VERIFIED
- ai.google.dev/gemini-api/docs/embeddings — `gemini-embedding-001`, MRL truncation, `outputDimensionality`, `taskType` — HIGH
- ai.google.dev/gemini-api/docs/structured-output — `responseMimeType`, `responseSchema`, Gemini structured output — HIGH
- mongodb.com/docs/atlas/atlas-vector-search/vector-search-type — vector index definition, filter fields, `numDimensions`, `cosine` — HIGH
- mongodb.com/docs/atlas/atlas-vector-search/vector-search-stage — `$vectorSearch` aggregation stage, `queryVector`, `filter`, `numCandidates`, `limit` — HIGH
- mongodb.com/docs/atlas/atlas-vector-search/deployment-options — M10+ tier requirement for dedicated Search Nodes — HIGH
- mongodb.com/docs/atlas/atlas-vector-search/hybrid-search — `$rankFusion` (Phase 7), MongoDB 8.0+ — HIGH
- newsdata.io/blog/newsdata-rate-limit — free tier 200 credits/day, 30 credits/15min, 10 articles/credit — HIGH
- developers.googleblog.com/gemini-embedding-available-gemini-api — `gemini-embedding-001` GA, MRL details — HIGH
- developers.googleblog.com/en/gemini-25-flash-lite-is-now-stable-and-generally-available — Flash-Lite GA — HIGH
- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/SUMMARY.md` — locked stack + invariants — HIGH

### Secondary (MEDIUM confidence)
- rss.feedspot.com/the_economic_times_rss_feeds — exact ET RSS URLs (corroborated by direct webfetch of feedspot page) — MEDIUM-HIGH (the URLs themselves are CITED; only the feedspot intermediary is a secondary index)
- rss.feedspot.com/moneycontrol_rss_feeds — MoneyControl section categorisation; **did not yield exact `.xml` URLs** — MEDIUM
- tokenmix.ai/blog/gemini-2-5-flash-lite-review-2026, toolkitbyai.com/gemini-2-5-flash-vs-flash-lite — Flash-Lite vs Flash pricing comparison — MEDIUM (corroborated by Google blog GA announcement)
- mongodb.com/company/blog/technical/harness-power-atlas-search-vector-search-with-rankfusion — RRF, $rankFusion usage — MEDIUM

### Tertiary (LOW confidence — flagged in Assumptions Log, mitigated by boot-time probe)
- MoneyControl `.xml` paths (`business.xml`, `MCtopnews.xml`, `marketreports.xml`, `latestnews.xml`, `iponews.xml`) — LOW (assumed URL pattern; live probe at boot is the mitigation)
- LiveMint `/rss/{section}` — LOW (assumed pattern)
- Business Standard `/rss/{section}-{n}.rss` — LOW
- BSE/NSE corporate-announcement exact RSS URLs — LOW (confirmed RSS exists, exact path unverified — defer to v1.1 or manual capture)

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every package version verified live against npm registry today; Gemini APIs cited against ai.google.dev; Atlas Vector Search cited against mongodb.com.
- Architecture: **HIGH** — pipeline shape, interceptor enforcement, aggregation formula, and recompute trigger are all prescriptive and consistent with the project's two non-negotiable invariants from SUMMARY.md.
- Pitfalls: **HIGH** for the technical/architectural pitfalls (dim mismatch, interceptor bypass, ticker overmatch); **MEDIUM** for the cache-versioning and rate-limit pitfalls (operational, will be tuned by observation).
- RSS source URLs: **MIXED** — Economic Times verified; MoneyControl/Mint/Business Standard/BSE/NSE marked ASSUMED with explicit mitigation (boot-time probe + Pitfall 4 alarm).

**Research date:** 2026-05-28
**Valid until:** 2026-06-28 (stack is stable; NewsData.io pricing or Gemini model pricing could shift on a shorter cycle — recheck before phase kickoff)
