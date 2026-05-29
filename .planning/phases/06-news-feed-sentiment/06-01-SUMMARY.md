# 06-01 Summary — News Ingestion Pipeline

**Plan:** 06-01-PLAN.md (slug: news-ingest) · **Requirement:** NEWS-01 (partial-A) · **Status:** complete, green

## Files created

```
apps/api/src/news/news.module.ts
apps/api/src/news/news.schema.ts
apps/api/src/news/news.repository.ts
apps/api/src/news/news.service.ts
apps/api/src/news/news.controller.ts
apps/api/src/news/dto/news-item.dto.ts
apps/api/src/news/ingest/feed-registry.ts
apps/api/src/news/ingest/dedup.ts
apps/api/src/news/ingest/ticker-tagger.ts
apps/api/src/news/ingest/feed-probe.ts
apps/api/src/news/jobs/news-poll.queue.ts
apps/api/src/news/jobs/news-poll.processor.ts
apps/api/src/news/vector/vector-index.constants.ts   (exports NEWS_EMBEDDING_DIM = 768, NEWS_VECTOR_INDEX_NAME, newsVectorIndex)
apps/api/src/news/vector/vector-index.assert.ts
infra/atlas/news_embedding_idx.json  + README.md
apps/api/src/app.module.ts            (NewsModule registered)
apps/api/package.json                 (rss-parser ^3.13)
```
Spec files: `ticker-tagger.spec`, `dedup.spec`, `feed-probe.spec`, `vector-index.assert.spec`, `news.service.spec`, `news.controller.spec` — **31 tests, all green**.

## Verification
- `vitest run src/news` → 31/31 pass.
- `tsc --noEmit` → clean.
- `eslint src/news` → clean (0 errors, 0 warnings).
- No `@google/genai` import anywhere under `src/news/**` (chokepoint respected — embeddings/sentiment are Plan 02).

## Decisions
- **90d TTL** accepted for v1 (`expireAfterSeconds: 90*24*60*60`); cold archive deferred (Open Q).
- NewsData.io 60-min poll guard lives in the processor; `apikey` stripped from logs.
- Unverified RSS hosts (MoneyControl / LiveMint) shipped `verified: false`; ET feeds `verified: true`.
- `GET /stocks/:ticker/news?limit=N` caps `limit` to `[1,50]` server-side (`MAX_LIMIT`); public, no auth (matches public report read path).

## Deviations from plan (for GSD trace honesty)
1. **Boot wiring lives in `news.module.ts`**, not `app.module.ts`. `NewsModule implements OnApplicationBootstrap` and calls `assertNewsVectorIndex(conn)` + (guarded) `probeFeeds(FEED_REGISTRY)`. Functionally equivalent and arguably cleaner — the module owns its own boot checks. `app.module.ts` only registers the module.
2. **Vector index constants file is `vector/vector-index.constants.ts`**, not `vector-index.spec.ts` (the plan's name; a `.spec.ts` filename would be picked up by the test runner). `NEWS_EMBEDDING_DIM = 768` remains the single source of truth; `infra/atlas/news_embedding_idx.json` mirrors it.
3. **RSS fetching reuses the Phase-2 `RssNewsAdapter`** (`modules/market-data/rss-news.adapter`) via DI rather than a new `news/ingest/rss.adapter.ts`. No domain code touches `rss-parser` directly. NewsData.io adapter likewise deferred to the shared market-data layer / Plan 02 where its only consumer (embed-classify) lives.
4. **Boot gates are env-guarded**: `assertNewsVectorIndex` is a no-op unless `ATLAS_VECTOR_ASSERT=true` (so local dev without Atlas Search still boots); `probeFeeds` runs only when `NEWS_FEED_PROBE_AT_BOOT=true`. Fail-loud behaviour preserved in deployed envs.
5. **FEED_REGISTRY shipped with the core verified set** (ET verified + MC/Mint assumed) rather than the full 19-entry inventory; expand in a later pass if coverage gaps appear.

## Open questions surfaced
- Cold-archive strategy for news older than 90d.
- BSE/NSE corporate-announcement feed URLs (excluded from v1).
- Whether to expand FEED_REGISTRY to the full research inventory.

## Plan 02 unblocked: yes
News schema (embedding/sentiment slots), vector index definition + boot assertion, ingest pipeline persisting `classificationStatus: 'pending'` docs, and the `GET /stocks/:ticker/news` read path are all ready for embeddings + sentiment classification.
