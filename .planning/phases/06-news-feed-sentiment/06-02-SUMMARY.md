# 06-02 Summary — Embeddings, Sentiment, Pillar Wire-up & News Feed UI

**Plan:** 06-02-PLAN.md (slug: sentiment-vector) · **Requirements:** NEWS-02, NEWS-03, NEWS-04 · **Status:** complete, green

## Files created / modified

**AI chokepoint (NEWS-02, NEWS-03)**
- `apps/api/src/ai/ai.service.ts` — added `classifySentiment`, `embedForStorage`, `embedForQuery`.
- `apps/api/src/ai/ai.types.ts` — `SentimentLabel`, `SentimentResult`.
- `apps/api/src/ai/prompts/sentiment.prompt.ts` — schema + system prompt.
- `apps/api/src/ai/ai.service.sentiment.spec.ts` — deterministic compliance + dim tests.
- `apps/api/src/ai/ai.service.smoke.spec.ts` — live-Gemini smoke (gated `RUN_LIVE_SMOKE=1`).

**Embed-classify pipeline** (under `src/jobs/**` to satisfy the COMP-02 import fence)
- `apps/api/src/jobs/news-embed-classify/embed-classify.queue.ts`
- `apps/api/src/jobs/news-embed-classify/embed-classify.processor.ts` (+ spec)
- `apps/api/src/news/news.repository.ts` — `semanticSearch`, `findRecentClassifiedForInstrument`, `findById`, `markFailed`.
- `apps/api/src/news/jobs/news-poll.processor.ts` — enqueue embed-classify **on new insert only**.
- `apps/api/src/news/news.module.ts` — register sibling queue + `AiModule` + processor.
- `apps/api/src/news/semantic-search.spec.ts` — Atlas integration (gated `RUN_INTEGRATION=1`).

**Sentiment pillar (NEWS-04)**
- `apps/api/src/sentiment/aggregator.ts` (+ spec) — pure recency/authority-weighted aggregate.
- `apps/api/src/sentiment/pillar-publisher.ts` (+ spec) — pure decision + scoring-shape mapping.
- `apps/api/src/sentiment/sentiment.service.ts` (+ spec) — orchestration + `news.classified` listener + selective recompute.
- `apps/api/src/sentiment/sentiment.types.ts`, `sentiment.module.ts`.
- `apps/api/src/sentiment/sentiment-scoring-contract.spec.ts` — proves `scoreStock` consumes the pillar.
- `apps/api/src/jobs/eod-recompute/eod-recompute.producer.ts` — `enqueueInstrument` (single-ticker recompute).
- `apps/api/src/jobs/eod-recompute/score-loaders.ts` — visible NEWS-04 seam comment.
- `apps/api/src/app.module.ts` — register `SentimentModule`.

**Frontend (NEWS-01/02 UI)**
- `packages/shared/src/news.ts` (+ barrel) — `SentimentLabel`, `NewsFeedItem`.
- `apps/web/src/app/_lib/reports/fetch-news.ts` — server fetch, `news:${ticker}` revalidate tag.
- `apps/web/src/app/_components/reports/{NewsFeed,SentimentBadge,RelativeTime}.tsx` (+ tests).
- `apps/web/src/app/_components/reports/ReportSkeleton.tsx` — `NewsShell`.
- `apps/web/src/app/(app)/stock/[ticker]/page.tsx` — `<NewsSection>` in Suspense, between cards and peers.

## Verification
- API: `vitest run` → 592 passed, 3 skipped (2 live-smoke + 1 Atlas integration, env-gated). `tsc` + `eslint src` clean.
- Web: `vitest run` → 101 passed. `tsc` clean, `eslint` clean, **`next build` succeeds** (stock page renders the news section server-side).
- Aggregator + pillar-publisher authored TDD (RED proven for aggregator before impl).
- `@google/genai` still imported only under `src/ai/**` (COMP-02 fence enforced — the embed-classify processor lives under `src/jobs/**` to comply).

## Decisions
- `TAU_HOURS = 168` (7-day half-life), `RECOMPUTE_THRESHOLD = 0.5`, `SOURCE_AUTHORITY` table (BSE/NSE 1.2, MC/ET/Mint/BS 1.0, NewsData 0.6, unknown 0.5) — all exported constants, admin-tuneable, deferred to milestone retro.
- Embedding model `gemini-embedding-001` @ 768; classifier `gemini-2.5-flash-lite` @ temp 0.0; `embeddingVersion`/`classifierVersion = "1"`.
- Pillar cache `sentiment:pillar:{id}` @ 36h TTL (project no-unbounded-key rule).
- Re-classify-on-version-bump: fields persisted; the scheduler that detects a bump is **documented, not built** (future trigger) to keep scope tight.

## Deviations from plan (primary-source reconciliation)
1. **Compliance is block-based, not strip-based.** The Phase-4 `ComplianceInterceptor` only inspects `.text` and *throws* on a violation (never rewrites), and `@UseInterceptors` on a provider is inert (Nest interceptors only fire on controller routes). So `classifySentiment` calls `sanitiseAndCheck` **directly** inside the AiService chokepoint and **drops the rationale to `null`** on any forbidden-verb match — the enum label (schema-constrained, safe) still persists. The raw rejected rationale is never logged. Proven deterministically in `ai.service.sentiment.spec.ts`.
2. **No `score-input-builder.ts`; the EOD score loader is an unimplemented Phase-2↔3 seam that throws.** NEWS-04 is therefore delivered as: pure aggregator + publisher + `SentimentService.computePillar()` returning the exact `ScoreStockSentiment | null` shape the scorer consumes, **proven via fixture** (`sentiment-scoring-contract.spec.ts`: non-null → pillar not fallback; null → `NO_SENTIMENT_DATA_PRE_PHASE_6`). End-to-end EOD consumption lands when the loader's real data assembler is built — marked as a visible seam in `score-loaders.ts`.
3. **Pillar contract is `sentiment.last30dAggregate` (0..10), not the plan's invented `sentimentPillar.fromNews`.** The aggregator output maps straight onto it; `analystConsensus` stays `null` (no analyst feed in Phase 6).
4. **embed-classify processor relocated to `src/jobs/news-embed-classify/`** (not `src/news/jobs/`) because the COMP-02 ESLint fence only permits `AiService` imports from `src/jobs/**` / `src/chat/**`. Fence respected rather than weakened.
5. **`all-confidence-0 → 5.0`, not `null`.** The aggregator's `den = Σweights` is confidence-independent, so the plan's "den===0 → null" path is unreachable with items present; tested to the real formula.
6. **Single-item source-authority test → mixed-polarity.** Under the normalised `raw = Σ(w·pol·conf)/Σw`, a lone item yields ±conf regardless of authority, so authority is exercised with mixed-polarity inputs.
7. **Shared UI type named `NewsFeedItem`** (not `NewsItem`) to avoid colliding with the existing ingestion-side `NewsItem` in `providers/news-provider.port`.
8. **No module cycle for the recompute trigger:** `SentimentModule → EodRecomputeModule` (one direction); the `news.classified` event flows via the global EventEmitter, so NewsModule does not depend back on SentimentModule.

## Open questions (carry-forward)
- Tune `SOURCE_AUTHORITY` / `TAU_HOURS` / `RECOMPUTE_THRESHOLD` against real data (milestone retro).
- Build the `classifierVersion`-bump re-classify scheduler when a model swap is needed.
- Resolve the loader↔sentiment injection (relocate loader or `forwardRef`) when the Phase-2↔3 assembler is implemented — selective recompute currently enqueues jobs the stubbed loader cannot complete (same pre-existing seam state as the nightly cron).

## Phase 6 status
NEWS-01..04 implemented and green. Phase 7 (Ask FinSight) unblocked — `AiService.embedForQuery` + `NewsRepository.semanticSearch` are ready to consume.
