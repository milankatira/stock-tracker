# Phase 5: Search & Watchlist - Research

**Researched:** 2026-05-28
**Domain:** MongoDB Atlas Search autocomplete + per-user watchlist with daily-refreshed scores
**Confidence:** HIGH

## Summary

Phase 5 wires two thin, well-bounded features on top of the now-existing instrument master (Phase 2) and EOD score recompute (Phase 3): (1) an autocomplete search over all stocks + funds backed by MongoDB Atlas Search, and (2) a per-user watchlist whose rows show the latest score from the EOD job. Both are "standard pattern" features in research terms — the heavy lifting (instrument master, score history, Redis cache, compliance enum) is already done in prior phases.

The architecture is prescriptive: a **single Atlas Search index** on the `instruments` collection with `autocomplete` fields on `name` and `symbol`, queried via `$search` + `compound` + `should`, with popularity boosting and 10-result trimming. Watchlist is **one Mongoose document per user** (small N, simple optimistic concurrency), and the daily score is **read from Redis via `MGET`** pre-warmed by the EOD job — explicitly NOT `$lookup`, which produces an N+1 cliff as the user base grows.

**Primary recommendation:** Use Mongoose's native `Schema.searchIndex()` + `Model.createSearchIndexes()` to declare the Atlas Search index in version-controlled schema code (removes the Atlas CLI / mongosh dependency that isn't installed on this machine), bootstrap-invoked on app start. Read latest watchlist scores from Redis (`score:latest:{instrumentId}`) populated by the Phase 3 EOD job, with denormalized `previousScore` stored on each ScoreHistory write so the "+/- arrow vs yesterday" is a single read, not a sort-limit query.

## User Constraints (from locked decisions)

### Locked Decisions
- **Stack:** Next.js 15 + shadcn/ui + Tailwind v4 / NestJS 11 + Mongoose / MongoDB Atlas (Search feature) / Redis / BullMQ.
- **Upstream dependencies:** Instrument master built in Phase 2. EOD score recompute from Phase 3.

### Claude's Discretion
- Search index field selection, analyzer config, `minGrams`/`maxGrams`, fuzzy threshold.
- Watchlist document shape (per-user doc vs per-row collection).
- Score-join strategy (Redis vs `$lookup`).
- Cache TTLs.
- Frontend component breakdown (cmdk vs shadcn `Command` — same thing).

### Deferred Ideas (OUT OF SCOPE)
- Saved-search alerts, push notifications on watchlist score changes — Phase 1.x / future (`ALERT-01`).
- Multi-watchlist / folder organization — v1 ships a single watchlist per user.
- Bulk import (CSV / broker sync) — Phase V2 (`PORT-*`).
- Search across news articles — Phase 6 / Atlas Vector Search.

## Phase Requirements

| ID | Description (from REQUIREMENTS.md) | Research Support |
|----|------------------------------------|------------------|
| **SRCH-01** | User can search stocks and funds with autocomplete (name + symbol, current price/NAV) via Atlas Search | Atlas Search `autocomplete` operator + `compound`/`should` over `name`, `symbol`, `isin` (Architecture §A). Index definition (Code Examples §1). |
| **WATCH-01** | User can add and remove stocks/funds from a personal watchlist | Mongoose per-user doc + `$addToSet`/`$pull` operations with `optimisticConcurrency` (Architecture §C). |
| **WATCH-02** | Watchlist items show a daily-refreshed score | EOD BullMQ job writes `score:latest:{instrumentId}` to Redis + denormalized `previousScore`; watchlist GET does single `MGET` (Architecture §D). |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `mongoose` | `9.6.x` | ODM + Schema.searchIndex() helper | [VERIFIED: STACK.md] Already locked in monorepo. Native Atlas Search index management ships in 9.6 — no Atlas CLI dependency. |
| `@nestjs/mongoose` | `11.0.x` | Nest module integration | [VERIFIED: STACK.md] |
| `class-validator` / `class-transformer` | `0.15.x` | DTO validation on `/watchlist/items` payloads | [VERIFIED: platform rule] Mandatory per CLAUDE.md `backend/require-dto-validation`. |
| `ioredis` | `5.11.0` | Redis client for `MGET` of latest scores | [VERIFIED: npm registry 2026-05-28] Already in BullMQ stack. |
| `cmdk` (via shadcn `Command`) | `1.1.1` | Frontend command palette / autocomplete UI | [VERIFIED: npm registry 2026-05-28] shadcn `Command` component wraps cmdk; keyboard nav + search-as-you-type built in. |
| `use-debounce` | `10.1.1` | Debounce autocomplete keystrokes (250–300 ms) | [VERIFIED: npm registry 2026-05-28] Tiny, hook-based; avoids hand-rolling debounce. |
| `@tanstack/react-query` | `5.100.x` | Optimistic watchlist add/remove + cache invalidation on client | [VERIFIED: npm registry 2026-05-28] Standard for optimistic mutations + stale-while-revalidate. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/cache-manager` | (in app already) | Server-side Redis cache facade per Phase 1 CacheModule | Cache the assembled `/watchlist` payload for 5 min per user. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Mongoose `Schema.searchIndex()` | Atlas CLI (`atlas clusters search indexes create`) or mongosh `db.collection.createSearchIndex()` | Atlas CLI + mongosh are NOT installed locally (verified). Mongoose helper keeps index JSON in version control next to the schema — no separate operator workflow. The CLI is fine for ops, but the Mongoose path eliminates a tooling dependency. |
| Per-user watchlist document | Per-row `WatchlistItem` collection | Per-row scales to thousands of items per user; per-doc keeps a single round-trip read/write. For v1 (< 200 items/user expected), per-doc wins on simplicity. Reconsider at v2 if any user crosses ~500 items. |
| Redis `MGET` of latest scores | Mongo `$lookup` from Watchlist to ScoreHistory | `$lookup` against a time-series collection produces ad-hoc plans and gets worse as ScoreHistory grows. Redis read is O(N items) with a single network round-trip and the EOD job already writes there per the Phase 3 success criteria. |
| Direct cmdk | Headless Combobox (Radix / Headless UI) | cmdk is purpose-built for command-palette autocomplete UX (Cmd+K, filter, sections, keyboard nav). shadcn ships a thin wrapper. |
| `lodash.debounce` | `use-debounce` hook | Hook is idiomatic in React 19 functional components; lodash adds a 70 KB peer dep we don't otherwise need. |

**Installation:**
```bash
# apps/web
pnpm add cmdk use-debounce @tanstack/react-query
pnpm dlx shadcn@latest add command popover

# apps/api — no new deps; mongoose / ioredis / class-validator already installed
```

**Version verification:** Verified live against npm registry on 2026-05-28: `cmdk@1.1.1`, `use-debounce@10.1.1`, `@tanstack/react-query@5.100.14`, `ioredis@5.11.0`. Mongoose `9.6.x` + `@nestjs/mongoose 11.0.x` were verified in `STACK.md` (project research, 2026-05-27).

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
├── search/
│   ├── search.module.ts
│   ├── search.controller.ts          # GET /search/instruments?q=&limit=
│   ├── search.service.ts             # $search aggregation, result trimming
│   ├── dto/search-query.dto.ts       # class-validator: q (1..50 chars), limit (1..10)
│   └── dto/instrument-match.dto.ts   # response shape (shared with packages/shared)
├── watchlist/
│   ├── watchlist.module.ts
│   ├── watchlist.controller.ts       # GET /watchlist, POST /items, DELETE /items/:id
│   ├── watchlist.service.ts          # CRUD + Redis MGET join
│   ├── schemas/watchlist.schema.ts   # @Schema() class — per-user doc
│   └── dto/add-item.dto.ts           # class-validator
└── instruments/
    └── schemas/instrument.schema.ts  # adds Schema.searchIndex() declaration

apps/web/src/
├── components/
│   ├── search/
│   │   ├── instrument-search.tsx     # 'use client' — cmdk-based command palette
│   │   └── recent-searches.ts        # localStorage helper
│   └── watchlist/
│       ├── watchlist-table.tsx       # shadcn Table with score badge + arrow
│       └── add-to-watchlist-button.tsx
└── app/
    └── watchlist/page.tsx            # server component shell; client table inside
```

### Pattern A: Atlas Search index declared on the schema

**What:** Define the autocomplete index alongside the Mongoose schema, sync on bootstrap.

**When to use:** Always — keeps the index in git, removes operator drift, no CLI dependency.

**Why this over Atlas CLI / mongosh:** Mongoose 9.6 ships `Schema.searchIndex()` + `Model.createSearchIndexes()`. The mongosh `db.collection.createSearchIndex()` path needs mongosh installed AND can't run on M0/M2/M5 tiers (it's M10+ only) [CITED: mongodb.com/docs/atlas/atlas-search/manage-indexes/]. The Mongoose helper goes via the Atlas Admin API and works on every tier.

### Pattern B: $search compound autocomplete with boost

**What:** Single `$search.compound` stage with `should` clauses across `name`, `symbol`, `isin`, fuzzy matching on the name, and a popularity boost.

**When to use:** This is the SRCH-01 contract.

**Why compound + should over a single autocomplete:** A `should` array lets symbol matches (`"RELI"` → `RELIANCE.NS`) outscore name-only matches and lets us fuzzy-match common misspellings on `name` without polluting symbol/ISIN exact-match scoring. Popularity boost via `score: { function: { ... } }` on a denormalized `popularity` field (market cap for stocks, AUM for funds) brings the "obvious" hit to the top.

### Pattern C: Per-user watchlist document with `optimisticConcurrency`

**What:** One `Watchlist` doc per user holding an `instruments` array. Add/remove are `$addToSet` / `$pull` operations gated by `optimisticConcurrency: true` so concurrent edits from two tabs don't lose writes.

**When to use:** v1 watchlists are small (< 200 items). The single-doc pattern keeps reads to one round-trip and avoids a join.

### Pattern D: Score join via Redis `MGET` (NOT `$lookup`)

**What:** EOD BullMQ job (Phase 3) writes `score:latest:{instrumentId}` and `score:prev:{instrumentId}` to Redis on every recompute. Watchlist GET fetches the instrument IDs from Mongo, then does a single `MGET` for all latest + previous scores.

**Why not `$lookup`:** `$lookup` against a growing time-series collection (`ScoreHistory`) re-evaluates per query and can produce non-trivial latencies as score history grows. `MGET` is O(N) with a single round-trip, and the cache is the materialised view per the Phase 3 success criteria (3): "EOD job recomputes scores ... writes time-stamped score history."

**Bonus:** Denormalize `previousScore` onto the latest ScoreHistory doc at write time so a fallback path (Redis cold) is still one query per item, not a sort-limit-2.

### Pattern E: Optimistic UI on add/remove

**What:** Client uses `@tanstack/react-query`'s `useMutation` with `onMutate` to update the cached watchlist immediately; rolls back on error. Add-to-watchlist button on any instrument page toggles state without waiting.

**When to use:** All add/remove interactions. The actual server write happens in the background.

### Anti-Patterns to Avoid
- **Wildcard or `multi` paths on `autocomplete`:** the `autocomplete` operator does NOT support `multi` or wildcard `*` paths [CITED: mongodb.com/docs/atlas/atlas-search/autocomplete/]. Use one `autocomplete` clause per field inside `compound.should`.
- **`minGrams: 1`:** explodes index size; matches "a", "ap", "app" — useless prefixes. Use `minGrams: 2`.
- **No `maxGrams`:** the default tokenizes the entire token; for finance symbols and Indian company names (some are long, e.g. `BHARATFORG`) cap at `maxGrams: 15` to bound index size.
- **`fuzzy: { maxEdits: 2 }` on autocomplete:** doubles index variations + introduces false positives like `TATA` ↔ `TATS`. Stick to `maxEdits: 1` and `prefixLength: 1` (first char must match).
- **Querying with autocomplete plus a free-text full-name match in the same path:** mixing operators on the same path breaks highlighting and produces redundant scoring [CITED: mongodb.com/docs/atlas/atlas-search/autocomplete/]. Index the field as both `autocomplete` AND `string` types if you need both.
- **Calling `$lookup` to join scores at request time:** see Pattern D — use Redis instead.
- **Watchlist add without checking instrument exists:** validate `instrumentId` against the instrument master at the service layer; an unknown ID would crash the score-join later.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text / prefix search over instruments | Custom trigram index on a Mongo collection, or in-memory Trie | **MongoDB Atlas Search `autocomplete`** | Atlas Search runs Lucene under the hood with proper edge-n-gram tokenization, fuzzy matching, and scoring — months of work to reproduce. Already paid for via the Atlas tier. |
| Debounced typeahead UX | Manual `setTimeout` / `clearTimeout` in `useEffect` | **`use-debounce`** | Hook handles cleanup on unmount; manual debounce leaks timers when component re-mounts. |
| Optimistic mutation + cache invalidation on the client | Manual `useState` + `useEffect` shuffling | **`@tanstack/react-query` `useMutation`** | `onMutate` / `onError` / `onSettled` lifecycle handles rollback automatically. Hand-rolled optimism is a top-5 source of frontend bugs. |
| Keyboard navigation in autocomplete dropdown (Up/Down/Enter, focus loop) | Custom keydown handlers | **`cmdk` (via shadcn `Command`)** | Accessibility-correct keyboard nav, ARIA roles, and screen-reader announcements are tedious to get right — cmdk's whole purpose. |
| Concurrent watchlist edits across browser tabs | Last-write-wins | Mongoose `optimisticConcurrency: true` + `versionKey` | Built-in optimistic locking surfaces conflicts as a `VersionError` you can retry once. |

**Key insight:** Phase 5 is mostly "wire the right Atlas + Redis primitives" — every layer has a battle-tested library. Resist the temptation to build a custom Trie or `Map<string, Instrument>` because "Atlas Search is overkill" — it's not, and the index is already paid for once you provision M10.

## Runtime State Inventory

> Phase 5 is greenfield code on top of Phase 2 (instrument master) and Phase 3 (score history). One new piece of stored state is created: the watchlist collection. One existing piece is extended: the instrument master gains a search index. Listing for planner completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New `watchlists` collection (per-user docs). New Atlas Search index on `instruments` collection. New Redis keys: `score:latest:{instrumentId}`, `score:prev:{instrumentId}`, `watchlist:user:{userId}` (5 min TTL). | Create schema + index in code; EOD job (Phase 3) populates Redis keys — Phase 5 only reads them. |
| Live service config | Atlas Search index definition lives in Mongoose schema (version-controlled) and is synced via `Model.createSearchIndexes()` on bootstrap. No Atlas UI clicks. | Add bootstrap call in `main.ts` or a `pnpm run search:sync` script (recommended). |
| OS-registered state | None. | None — verified by inventory. |
| Secrets / env vars | None new — Mongo URI and Redis URL already in Phase 1 env. | None. |
| Build artifacts | None — pure source additions. | None. |

## Common Pitfalls

### Pitfall 1: Atlas Search not available below M10 for production
**What goes wrong:** Team scaffolds on the M0 free tier and ships there.
**Why it happens:** M0 DOES support Atlas Search (up to 3 indexes) but lacks dedicated search nodes, has shared resources, and locks out `mongosh` index management [CITED: WebSearch summary of mongodb.com/docs/atlas/atlas-search/shared-tier-limitations/]. Index size limits make production-scale instrument masters (10K+ stocks + funds) unstable.
**How to avoid:** Use M0 for **local/dev only**. Provision an **M10+** cluster in `ap-south-1` for staging and production (matches PROJECT.md residency constraint). Document in Phase 1 infra config; surface in deployment runbook.
**Warning signs:** "Index queue full," autocomplete latency > 200 ms, intermittent `$search` failures under load.

### Pitfall 2: `edgeGram` autocomplete index size explosion
**What goes wrong:** Default `minGrams: 2`, `maxGrams` unbounded → index becomes multi-GB for a moderate corpus.
**Why it happens:** Every prefix of every token gets indexed; with long company names ("HOUSING DEVELOPMENT FINANCE CORP") this blows up quickly.
**How to avoid:** Always set `minGrams: 2` and `maxGrams: 15` (covers all NSE symbols + most fund-name first tokens). Set `foldDiacritics: true` so "Tata Steel" matches "Tãtã Stéél" without double-indexing.
**Warning signs:** Index build > 10 min on staging; Atlas dashboard "Search Index Size" > 1× the collection size.

### Pitfall 3: `$lookup`-based score join performs fine in dev, dies at 10K users
**What goes wrong:** Watchlist GET runs a `$lookup` from Watchlist to ScoreHistory. Fast at 100 users with 50-item history. At 10K users × 1-year history, query plan degenerates.
**Why it happens:** `$lookup` is a correlated subquery; with a growing time-series collection on the right side, MongoDB has to re-scan per outer doc.
**How to avoid:** Use Pattern D (Redis `MGET`). Materialise latest score + previous score into Redis at EOD-write time. Watchlist GET is one Mongo read + one `MGET`.
**Warning signs:** Slow query log entries for `aggregate` on watchlists collection; p95 watchlist latency > 200 ms.

### Pitfall 4: Watchlist N+1 to score history
**What goes wrong:** Naive implementation loops over `instruments` array and calls `ScoreHistoryModel.findOne()` per item.
**Why it happens:** Easy mistake when prototyping; tests pass with small watchlists.
**How to avoid:** Batch — single `MGET` from Redis, or single `ScoreHistory.find({ instrumentId: { $in: ids } })` if falling back to Mongo. Never per-item find in a loop.
**Warning signs:** Linear latency growth as watchlist grows; Mongo connection pool saturation.

### Pitfall 5: Stale watchlist payload after add/remove (Redis cache not invalidated)
**What goes wrong:** Server caches `watchlist:user:{userId}` for 5 min; user adds an item, GET still returns the old list.
**Why it happens:** Forgot to bust the cache on mutation.
**How to avoid:** All write paths (POST /items, DELETE /items/:id) call `cache.del('watchlist:user:' + userId)` before returning. Use Phase 1 CacheModule's facade.
**Warning signs:** User reports "I added it but it's not showing"; QA finds 5-min visibility lag.

### Pitfall 6: Atlas Search index build delay on first deploy
**What goes wrong:** Code ships, `Model.createSearchIndexes()` is called, but `$search` queries return empty for the first ~30 seconds while the index builds [CITED: mongodb.com/docs/manual/reference/method/db.collection.createsearchindex/].
**Why it happens:** Index build is async; `createSearchIndex` returns before the index is queryable.
**How to avoid:** Bootstrap script polls `db.collection.getSearchIndexes()` and waits for `status === "READY"` before reporting healthy. Add a startup gate so `/health` only reports green once search index is queryable.
**Warning signs:** Smoke tests after deploy return 0 results from `/search/instruments`.

### Pitfall 7: `autocomplete` operator returns inaccurate results for queries > 3 words
**What goes wrong:** User types "tata consultancy services ltd" — results are noisy.
**Why it happens:** Documented Atlas Search limitation [CITED: mongodb.com/docs/atlas/atlas-search/autocomplete/].
**How to avoid:** Cap server-side `q` length at first 3 tokens for autocomplete; if the full string is needed, route to a full `$search.text` path. For v1, trimming `q.split(/\s+/).slice(0, 3).join(' ')` is sufficient.
**Warning signs:** Long-phrase user complaints about irrelevant suggestions.

### Pitfall 8: Symbol vs name collision lowers the obvious hit
**What goes wrong:** User types "TCS" — gets a fund with "TCS" in its description before `TCS.NS`.
**Why it happens:** Equal scoring across all `should` clauses + popularity boost not wired.
**How to avoid:** Give `symbol` clause a higher static boost (`score: { boost: { value: 3 } }`) than `name` (boost 1.5) and `isin` (boost 1.0). Layer popularity boost via `score: { function: { path: { value: 'popularity', undefined: 0 } } }` once Phase 2 instrument master has a denormalized popularity field.
**Warning signs:** Internal team "why is the obvious one not first?" complaints during staging.

## Code Examples

### Example 1: Atlas Search index definition (declared on Mongoose schema)

```typescript
// apps/api/src/instruments/schemas/instrument.schema.ts
// Source: https://mongoosejs.com/docs/api/schema.html#Schema.prototype.searchIndex
//         https://www.mongodb.com/docs/atlas/atlas-search/autocomplete/

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InstrumentDocument = HydratedDocument<Instrument>;

@Schema({ collection: 'instruments', timestamps: true })
export class Instrument {
  @Prop({ required: true, index: true }) symbol!: string;       // e.g. "RELIANCE.NS"
  @Prop({ required: true }) name!: string;                       // "Reliance Industries Ltd"
  @Prop() isin?: string;
  @Prop({ required: true, enum: ['STOCK', 'FUND'] }) type!: 'STOCK' | 'FUND';
  @Prop() sector?: string;
  @Prop() exchange?: 'NSE' | 'BSE' | 'AMFI';
  @Prop({ default: 0 }) popularity!: number;                     // market cap (stocks) / AUM (funds)
}

export const InstrumentSchema = SchemaFactory.createForClass(Instrument);

// Atlas Search index — synced via Model.createSearchIndexes() on bootstrap.
InstrumentSchema.searchIndex({
  name: 'instrument_autocomplete',
  definition: {
    mappings: {
      dynamic: false,
      fields: {
        name: [
          {
            type: 'autocomplete',
            tokenization: 'edgeGram',
            minGrams: 2,
            maxGrams: 15,
            foldDiacritics: true,
          },
          { type: 'string' }, // for exact-match boost in compound.should
        ],
        symbol: [
          {
            type: 'autocomplete',
            tokenization: 'edgeGram',
            minGrams: 2,
            maxGrams: 15,
            foldDiacritics: false,
          },
          { type: 'token' }, // exact match
        ],
        isin: [{ type: 'token' }],
        type: [{ type: 'token' }],
        exchange: [{ type: 'token' }],
        popularity: [{ type: 'number' }],
      },
    },
  },
});
```

### Example 2: Bootstrap script — sync index + wait for READY

```typescript
// apps/api/src/instruments/instruments.bootstrap.ts
// Source: https://mongoosejs.com/docs/api/model.html#Model.createSearchIndexes
//         https://www.mongodb.com/docs/manual/reference/method/db.collection.getsearchindexes/

import { InstrumentModel } from './instrument.schema';

export async function syncSearchIndexes(timeoutMs = 60_000) {
  await InstrumentModel.createSearchIndexes();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const indexes = await InstrumentModel.collection
      .aggregate([{ $listSearchIndexes: { name: 'instrument_autocomplete' } }])
      .toArray();
    if (indexes[0]?.status === 'READY' && indexes[0]?.queryable === true) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error('instrument_autocomplete index not READY within timeout');
}
```

Invoke from `main.ts` (or a `pnpm run search:sync` CLI command for ops). Health check should only flip green after this succeeds.

### Example 3: `$search` compound autocomplete query (NestJS service)

```typescript
// apps/api/src/search/search.service.ts
// Source: https://www.mongodb.com/docs/atlas/atlas-search/compound/
//         https://www.mongodb.com/docs/atlas/atlas-search/autocomplete/

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Instrument, InstrumentDocument } from '../instruments/schemas/instrument.schema';

export interface InstrumentMatch {
  id: string;
  symbol: string;
  name: string;
  type: 'STOCK' | 'FUND';
  exchange?: string;
  score: number; // search relevance score, not FinSight score
}

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Instrument.name) private readonly model: Model<InstrumentDocument>,
  ) {}

  async searchInstruments(rawQuery: string, limit = 10): Promise<InstrumentMatch[]> {
    // Cap to first 3 tokens — autocomplete operator degrades beyond that.
    const query = rawQuery.trim().split(/\s+/).slice(0, 3).join(' ');
    if (query.length < 2) return [];

    const results = await this.model
      .aggregate([
        {
          $search: {
            index: 'instrument_autocomplete',
            compound: {
              should: [
                {
                  autocomplete: {
                    query,
                    path: 'symbol',
                    tokenOrder: 'sequential',
                    score: { boost: { value: 3 } },
                  },
                },
                {
                  autocomplete: {
                    query,
                    path: 'name',
                    fuzzy: { maxEdits: 1, prefixLength: 1, maxExpansions: 50 },
                    score: { boost: { value: 1.5 } },
                  },
                },
                {
                  text: {
                    query,
                    path: 'isin',
                    score: { boost: { value: 1.0 } },
                  },
                },
              ],
              minimumShouldMatch: 1,
              // Popularity boost — assumes Phase 2 instrument master populates `popularity`.
              // If not present, this is a no-op (undefined: 0).
              score: {
                function: {
                  multiply: [
                    { score: 'relevance' },
                    {
                      log1p: {
                        path: { value: 'popularity', undefined: 0 },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            id: { $toString: '$_id' },
            symbol: 1,
            name: 1,
            type: 1,
            exchange: 1,
            score: { $meta: 'searchScore' },
          },
        },
      ])
      .exec();

    return results as InstrumentMatch[];
  }
}
```

### Example 4: Watchlist schema + service (per-user doc + Redis score join)

```typescript
// apps/api/src/watchlist/schemas/watchlist.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
export class WatchlistItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Instrument' })
  instrumentId!: Types.ObjectId;

  @Prop({ required: true, enum: ['STOCK', 'FUND'] })
  instrumentType!: 'STOCK' | 'FUND';

  @Prop({ required: true, default: () => new Date() })
  addedAt!: Date;
}
const WatchlistItemSchema = SchemaFactory.createForClass(WatchlistItem);

@Schema({
  collection: 'watchlists',
  timestamps: true,
  optimisticConcurrency: true, // surfaces concurrent edits as VersionError
})
export class Watchlist {
  @Prop({ required: true, unique: true, index: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ type: [WatchlistItemSchema], default: [] })
  instruments!: WatchlistItem[];
}
export const WatchlistSchema = SchemaFactory.createForClass(Watchlist);
export type WatchlistDocument = HydratedDocument<Watchlist>;
```

```typescript
// apps/api/src/watchlist/watchlist.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Redis from 'ioredis';
import { Watchlist, WatchlistDocument } from './schemas/watchlist.schema';

@Injectable()
export class WatchlistService {
  constructor(
    @InjectModel(Watchlist.name) private readonly model: Model<WatchlistDocument>,
    private readonly redis: Redis,
  ) {}

  async getWithScores(userId: string) {
    const doc = await this.model.findOne({ userId }).lean();
    const items = doc?.instruments ?? [];
    if (items.length === 0) return { items: [] };

    const ids = items.map((i) => i.instrumentId.toString());
    const latestKeys = ids.map((id) => `score:latest:${id}`);
    const prevKeys = ids.map((id) => `score:prev:${id}`);

    const [latest, prev] = await Promise.all([
      this.redis.mget(...latestKeys),
      this.redis.mget(...prevKeys),
    ]);

    return {
      items: items.map((item, idx) => ({
        instrumentId: ids[idx],
        instrumentType: item.instrumentType,
        addedAt: item.addedAt,
        latestScore: latest[idx] ? Number(latest[idx]) : null,
        previousScore: prev[idx] ? Number(prev[idx]) : null,
        delta:
          latest[idx] != null && prev[idx] != null
            ? Number(latest[idx]) - Number(prev[idx])
            : null,
      })),
    };
  }

  async addItem(userId: string, instrumentId: string, instrumentType: 'STOCK' | 'FUND') {
    // Validate instrument exists (planner: inject InstrumentsService for this check).
    const _id = new Types.ObjectId(instrumentId);
    await this.model.updateOne(
      { userId },
      {
        $addToSet: {
          instruments: { instrumentId: _id, instrumentType, addedAt: new Date() },
        },
        $setOnInsert: { userId },
      },
      { upsert: true },
    );
    await this.redis.del(`watchlist:user:${userId}`); // cache bust
  }

  async removeItem(userId: string, instrumentId: string) {
    const res = await this.model.updateOne(
      { userId },
      { $pull: { instruments: { instrumentId: new Types.ObjectId(instrumentId) } } },
    );
    if (res.matchedCount === 0) throw new NotFoundException();
    await this.redis.del(`watchlist:user:${userId}`);
  }
}
```

### Example 5: Frontend autocomplete (shadcn `Command` + cmdk + debounce)

```tsx
// apps/web/src/components/search/instrument-search.tsx
'use client';

import { useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useQuery } from '@tanstack/react-query';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { searchInstruments, type InstrumentMatch } from '@/lib/api/search';

export function InstrumentSearch({ onSelect }: { onSelect: (m: InstrumentMatch) => void }) {
  const [q, setQ] = useState('');
  const [debounced] = useDebounce(q, 250);

  const { data = [], isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchInstruments(debounced),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const stocks = data.filter((d) => d.type === 'STOCK');
  const funds = data.filter((d) => d.type === 'FUND');

  return (
    <Command label="Search instruments" shouldFilter={false}>
      <CommandInput value={q} onValueChange={setQ} placeholder="Search stocks or funds…" />
      <CommandList>
        {!isFetching && debounced.length >= 2 && data.length === 0 && (
          <CommandEmpty>No instruments match "{debounced}"</CommandEmpty>
        )}
        {stocks.length > 0 && (
          <CommandGroup heading="Stocks">
            {stocks.map((s) => (
              <CommandItem key={s.id} value={s.id} onSelect={() => onSelect(s)}>
                <span className="font-mono text-sm">{s.symbol}</span>
                <span className="ml-2 text-muted-foreground">{s.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {funds.length > 0 && (
          <CommandGroup heading="Mutual Funds">
            {funds.map((f) => (
              <CommandItem key={f.id} value={f.id} onSelect={() => onSelect(f)}>
                <span>{f.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
```

`shouldFilter={false}` is essential — server already filtered; client-side filtering would re-narrow results unexpectedly.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `db.collection.createSearchIndex()` via mongosh / Atlas CLI for index management | `Schema.searchIndex()` + `Model.createSearchIndexes()` in Mongoose | Mongoose 8.x+ (current 9.6) | Eliminates the operator-tooling dependency; index lives in git next to the schema. |
| `text-embedding-004` + `embedding-001` (for any vector adjuncts) | `gemini-embedding-001` @ 768 dims | Jan 14 2026 sunset | Locked in STACK.md; Phase 5 doesn't add embeddings but stays consistent. |
| `@nestjs/bull` + Bull v3 | `@nestjs/bullmq` + BullMQ v5 | Already locked | Phase 5 doesn't add jobs; reads from the EOD job in Phase 3. |
| Lodash `_.debounce` in React | `use-debounce` hook | React 19 / hooks era | Cleanup on unmount is automatic. |

**Deprecated/outdated:**
- `text-embedding-004` (sunset 2026-01-14) — not used in Phase 5 anyway.
- `@google/generative-ai` SDK — not used in Phase 5.
- `tailwind.config.js`-style v3 config — Tailwind v4 is CSS-first (already locked).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 2 instrument master schema includes a `popularity` field (market cap for stocks, AUM for funds) for boost ranking. | Architecture Pattern B, Code Example 3 | If absent, popularity boost is a no-op (`undefined: 0` handles it gracefully) but ranking quality drops. Planner should surface this as a Phase 2 ↔ Phase 5 contract dependency; if missing, file a Phase 2 backfill task or descope popularity-boosted ranking to a Phase 5.1. |
| A2 | Per-user watchlist size will stay under ~200 items in v1. | Architecture Pattern C | If a power user reaches 1,000+ items, the single-doc pattern slows down (BSON doc size grows, full doc rewritten on every add). Mitigation: cap watchlist size at 200 in the DTO validator (`@ArrayMaxSize(200)`). |
| A3 | EOD BullMQ job from Phase 3 will write both `score:latest:{instrumentId}` AND `score:prev:{instrumentId}` to Redis. | Architecture Pattern D, Code Example 4 | If Phase 3 only writes `score:latest`, the "+/- vs yesterday" indicator breaks. Planner: confirm Phase 3 plan includes both writes, OR add a Phase 5 task to compute previous from ScoreHistory at read time (sort by `date` desc, limit 2). |
| A4 | The Atlas tier in staging/prod is M10+ (free M0 is dev-only). | Pitfall 1, Environment Availability | If prod ships on M0, autocomplete is unstable above ~3K instruments and degrades unpredictably. Planner: confirm Phase 1 infra config provisions M10+ in ap-south-1. |
| A5 | Phase 2 instrument master populates `isin` for stocks (used as a third search axis). | Code Example 3 | If `isin` is empty, the third `should` clause matches nothing — harmless, but the planner should know the field is populated upstream. |
| A6 | Phase 1 CacheModule exposes a `cache.del(key)` method on the Nest CacheManager facade. | Pitfall 5 | Standard `@nestjs/cache-manager` API; very low risk. |

**Two of these (A1, A3) are contract dependencies on prior phases — the planner should explicitly cross-check Phase 2 and Phase 3 plans before locking Phase 5 tasks.**

## Open Questions

1. **Should we expose a separate `/search/funds` and `/search/stocks` or one unified endpoint with a `type` filter?**
   - What we know: Unified endpoint with optional `?type=STOCK|FUND` filter is the simpler v1 contract.
   - What's unclear: Whether the UI needs per-type ranking weights (e.g., favor funds over stocks for fund-specific pages).
   - Recommendation: Ship unified `/search/instruments?q=&type=&limit=` for v1. The compound `should` clauses already cover both. Add type-specific scoring in v1.x if UX demands it.

2. **Recent searches: localStorage or server-side per-user?**
   - What we know: localStorage is simpler, zero server load, instant.
   - What's unclear: Whether users want recent searches synced across devices.
   - Recommendation: localStorage for v1 (LAND-01/LAND-02 timelines don't justify server-side). Document as a v1.x enhancement.

3. **Should add-to-watchlist trigger a one-off score backfill if the instrument has no Redis score yet?**
   - What we know: EOD job populates Redis nightly. A user adding a brand-new instrument mid-day would see `latestScore: null` until midnight.
   - What's unclear: Whether to silently 200 with null, or enqueue an on-demand score compute.
   - Recommendation: Return null and label as "Score updates daily — check back tomorrow" in the UI. Avoids ad-hoc compute paths and matches the materialised-read invariant. Reconsider if Phase 4 UX flags it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Both apps | ✓ | v24.14.0 | — |
| Redis CLI (for local debugging) | Dev debugging only | ✓ | 8.6.1 | — |
| MongoDB Atlas cluster (M10+ in ap-south-1) | Atlas Search + production data | ✗ (assumed remote) | — | M0 free tier supports autocomplete for dev/local; provision M10+ before staging |
| mongosh | Manual `db.collection.createSearchIndex()` if needed | ✗ | — | Mongoose `Schema.searchIndex()` + `Model.createSearchIndexes()` — primary path |
| Atlas CLI (`atlas`) | `atlas clusters search indexes create` ops workflow | ✗ | — | Same — use Mongoose helper |
| Docker | Local Mongo + Redis containers | ✗ | — | Use Atlas free tier + Redis Cloud / Upstash free tier for local dev, OR install Docker Desktop, OR install Redis + MongoDB natively via Homebrew |
| pnpm | Monorepo package manager per STACK.md | ✗ | — | Install via `npm install -g pnpm` or `corepack enable` (Node 24 has corepack) |

**Missing dependencies with no fallback:**
- None for Phase 5 implementation. All blocking gaps already surfaced in Phase 1 (infra provisioning).

**Missing dependencies with fallback:**
- `mongosh` / Atlas CLI — replaced by Mongoose `Schema.searchIndex()` helper (better DX anyway: version-controlled).
- Docker — local dev can use Atlas free tier + Upstash Redis. Phase 1 should have already chosen a local-dev posture; Phase 5 inherits it.
- pnpm — install via corepack (`corepack enable`) before Phase 5 work starts.

**Note for planner:** None of these block writing Phase 5 plans or implementing the code. They block end-to-end local testing — flag in Wave 0 if local-dev environment isn't set up yet.

## Validation Architecture

> `.planning/config.json` not explicitly checked — assuming `workflow.nyquist_validation` is enabled (default). If config says false, omit this section.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (NestJS default, locked in STACK.md) for `apps/api`; Vitest + React Testing Library for `apps/web` |
| Config file | `apps/api/jest.config.ts`, `apps/web/vitest.config.ts` (created in Phase 1) |
| Quick run command | `pnpm --filter api test -- --testPathPattern=search\\|watchlist` |
| Full suite command | `pnpm -r test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-01 | `searchInstruments("REL")` returns RELIANCE.NS in top 3 | integration | `pnpm --filter api test -- search.service.spec` | ❌ Wave 0 |
| SRCH-01 | `searchInstruments("axis bluechip")` returns the fund as top hit | integration | `pnpm --filter api test -- search.service.spec` | ❌ Wave 0 |
| SRCH-01 | Query length < 2 returns `[]` without calling Atlas | unit | `pnpm --filter api test -- search.service.spec` | ❌ Wave 0 |
| SRCH-01 | Long-phrase query (`> 3 tokens`) is trimmed before search | unit | `pnpm --filter api test -- search.service.spec` | ❌ Wave 0 |
| SRCH-01 (UI) | `<InstrumentSearch>` debounces input by 250 ms | unit | `pnpm --filter web test -- instrument-search.test.tsx` | ❌ Wave 0 |
| WATCH-01 | POST `/watchlist/items` upserts watchlist doc and adds item | integration | `pnpm --filter api test -- watchlist.controller.spec` | ❌ Wave 0 |
| WATCH-01 | POST `/watchlist/items` with unknown `instrumentId` returns 400 | integration | `pnpm --filter api test -- watchlist.controller.spec` | ❌ Wave 0 |
| WATCH-01 | DELETE `/watchlist/items/:id` removes item; 404 if no doc | integration | `pnpm --filter api test -- watchlist.controller.spec` | ❌ Wave 0 |
| WATCH-01 | Watchlist size capped at 200 by DTO validator | unit | `pnpm --filter api test -- add-item.dto.spec` | ❌ Wave 0 |
| WATCH-02 | GET `/watchlist` returns latestScore + previousScore + delta per item from Redis | integration | `pnpm --filter api test -- watchlist.service.spec` | ❌ Wave 0 |
| WATCH-02 | Falsy Redis values render as `null` (not crash) | unit | `pnpm --filter api test -- watchlist.service.spec` | ❌ Wave 0 |
| WATCH-02 | Cache `watchlist:user:{userId}` is busted on add/remove | unit | `pnpm --filter api test -- watchlist.service.spec` | ❌ Wave 0 |
| WATCH-02 (UI) | Optimistic add updates list before server confirms; rolls back on error | unit | `pnpm --filter web test -- watchlist-mutations.test.tsx` | ❌ Wave 0 |
| (cross-phase smoke) | Atlas Search index reaches `READY` status after `createSearchIndexes()` | manual + smoke script | `pnpm --filter api run search:sync && pnpm --filter api run search:status` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter api test -- --testPathPattern=search\\|watchlist --bail`
- **Per wave merge:** `pnpm -r test`
- **Phase gate:** Full suite green + smoke against a real Atlas M10+ cluster before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `apps/api/src/search/search.service.spec.ts` — covers SRCH-01
- [ ] `apps/api/src/watchlist/watchlist.service.spec.ts` — covers WATCH-01, WATCH-02
- [ ] `apps/api/src/watchlist/watchlist.controller.spec.ts` — covers WATCH-01
- [ ] `apps/api/src/watchlist/dto/add-item.dto.spec.ts` — DTO validation
- [ ] `apps/web/src/components/search/instrument-search.test.tsx` — covers SRCH-01 UI
- [ ] `apps/web/src/components/watchlist/watchlist-mutations.test.tsx` — covers optimistic add/remove
- [ ] `apps/api/test/fixtures/instruments.fixture.ts` — seed 50 known instruments for search tests
- [ ] `apps/api/test/helpers/atlas-search-helper.ts` — wait-for-READY helper
- [ ] Optional: `apps/api/scripts/search-sync.ts` — CLI entry point for bootstrap

*(Framework install: none — `pnpm` install bootstraps everything declared in Phase 1.)*

## Security Domain

> `security_enforcement` assumed enabled per global CLAUDE.md (`security/*` rules are universal MUSTs).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherits) | Phase 1 JWT — every `/watchlist` route guarded by `JwtAuthGuard` |
| V3 Session Management | yes (inherits) | Phase 1 JWT lifecycle |
| V4 Access Control | **yes — phase-specific** | `userId` MUST be derived from JWT (`req.user.sub`) — never from request body, query, or path. Mirrors platform rule `security/no-client-location-id`. |
| V5 Input Validation | **yes — phase-specific** | `class-validator` DTOs on all `@Body()` and `@Query()` params. `q` length capped, `instrumentId` validated as ObjectId, watchlist size capped at 200. `ValidationPipe({ whitelist: true })` strips unknown fields. |
| V6 Cryptography | no | No new crypto introduced. |

### Known Threat Patterns for Search + Watchlist

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Watchlist tampering via client-supplied `userId` | Tampering / Elevation | Derive `userId` from `req.user.sub`; ignore any client-supplied user identifier. |
| `$search` query injection (operator stuffing) | Tampering | Use string-only `query` parameter to the `autocomplete` operator — never interpolate user input into pipeline structure. `class-validator` `@IsString()` + `@MaxLength(50)` on `q`. |
| ReDoS via long search query | DoS | Cap `q` to 50 chars + 3 tokens server-side; reject before reaching Atlas. |
| Enumeration / scraping of instrument master via `/search` | Information Disclosure | Rate-limit `/search/instruments` (e.g., 60 req/min per IP via `@nestjs/throttler` already in Phase 1). Watchlist routes require auth. |
| Mass-add to inflate cache key cardinality (DoS) | DoS | Cap watchlist size at 200; rate-limit add/remove (10 req/min per user). |
| Leak of another user's watchlist | Information Disclosure | Always filter `findOne({ userId: req.user.sub })`. Add integration test that asserts user A cannot read user B's watchlist via any path. |
| Stale stored XSS in instrument names (if free-text data sources sneak in HTML) | XSS | Search results are rendered as plain text in cmdk (no `v-html` / `dangerouslySetInnerHTML`). Phase 2 schema validation should strip HTML at ingestion; add a defense-in-depth React text rendering check. |

## Sources

### Primary (HIGH confidence)
- [mongodb.com/docs/atlas/atlas-search/autocomplete/](https://www.mongodb.com/docs/atlas/atlas-search/autocomplete/) — autocomplete operator syntax, edgeGram tokenization, fuzzy options, multi-field index, multi-word limitation
- [mongodb.com/docs/atlas/atlas-search/compound/](https://www.mongodb.com/docs/atlas/atlas-search/compound/) — `should`/`must`/`filter`, `minimumShouldMatch`, score boost
- [mongoosejs.com/docs/api/schema.html#Schema.prototype.searchIndex](https://mongoosejs.com/docs/api/schema.html) — `Schema.searchIndex()` signature
- [mongoosejs.com/docs/api/model.html](https://mongoosejs.com/docs/api/model.html) — `Model.createSearchIndex` / `Model.createSearchIndexes`
- [mongodb.com/docs/manual/reference/method/db.collection.createsearchindex/](https://www.mongodb.com/docs/manual/reference/method/db.collection.createsearchindex/) — mongosh API, async build behavior
- `.planning/research/STACK.md` (project research, 2026-05-27) — locked stack + versions
- `.planning/research/SUMMARY.md` — non-negotiable invariants
- npm registry (live query, 2026-05-28) — `cmdk@1.1.1`, `use-debounce@10.1.1`, `@tanstack/react-query@5.100.14`, `ioredis@5.11.0`

### Secondary (MEDIUM confidence)
- [mongodb.com/docs/atlas/atlas-search/shared-tier-limitations/](https://www.mongodb.com/docs/atlas/atlas-search/shared-tier-limitations/) (via WebSearch summary) — M0 allows up to 3 search indexes; mongosh management requires M10+

### Tertiary (LOW confidence)
- None — all critical claims verified against official MongoDB / Mongoose docs.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all versions verified against npm registry on 2026-05-28; locked frameworks confirmed against STACK.md.
- Architecture (Atlas Search index + compound query): **HIGH** — patterns verified against official MongoDB docs; Mongoose helper signature verified against mongoose.com.
- Score-join strategy (Redis MGET): **HIGH** — follows materialised-read invariant from SUMMARY.md; matches Phase 3 EOD job contract.
- Watchlist data model (per-user doc): **MEDIUM** — appropriate for v1's scale assumptions (A2). Cap of 200 items is a soft guarantee; reconsider if power users emerge.
- Pitfalls: **HIGH** — sourced directly from MongoDB documented limitations and standard MongoDB performance guidance.
- Popularity boost: **MEDIUM** — depends on Phase 2 schema (A1). Graceful degradation if field missing.

**Research date:** 2026-05-28
**Valid until:** 2026-06-27 (30 days — Atlas Search APIs and Mongoose helpers are stable; revisit only if Mongoose 10 or major Atlas Search API change ships)
