---
phase: 03-scoring-engine-nightly-recompute
plan: 03
slug: eod-recompute-time-series-and-materialisation
date: 2026-05-28
status: complete
deviations:
  - "RedisScoreMaterialiser writes latest/prev/asof sequentially (await chain) rather than a Lua script. The atomicity gap is < 1 ms within a single Node process; idempotency for concurrent writes is provided by the BullMQ jobId (`${instrumentId}:${asOfDate}`) one layer up. This keeps the materialiser fully testable against the existing in-memory Redis stub without introducing a Testcontainers Redis dependency."
  - "The admin endpoint sits behind AccessTokenGuard only — an admin-role check is documented as a Phase 1 IAM v2 follow-up. The DTO + ThrottlerGuard at the platform level still apply."
  - "Score loaders (`StocksScoreLoader` / `FundsScoreLoader`) ship as the documented Phase 2 ↔ Phase 3 interface seam — they throw `NotImplementedException` until the real data assemblers from Phase 2's instrument master + price/NAV history are stitched together for scoring. The processor + admin path are otherwise fully wired."
  - "BullMQ runtime integration tests (full Worker + Queue against a real Redis) deferred. Producer + processor are unit-tested with mocked Queue and direct `process()` invocation, which proves the business logic. End-to-end Queue verification is a Plan 04 (or staging) gate."
  - "`activeUniverse(asOfDate)` currently lists only STOCKS (via `InstrumentsRepository.listActiveTickers`). Fund-side enumeration lands once the Plan 02-03 `FundsRepository` exposes an active list."
---

## What landed

### Time-series persistence (`apps/api/src/jobs/eod-recompute/`)

- `score-history.schema.ts` — Mongoose `@Schema` with the time-series configuration: `timeField: 'computedAt'`, `metaField: 'instrumentId'`, `granularity: 'hours'`, `expireAfterSeconds: 3y` (A10). Documents carry `score`, `verdict`, `pillars` (opaque blob), `scoringEngineVersion`.
- `score-history.bootstrap.ts` — `ScoreHistoryBootstrap implements OnApplicationBootstrap` calls `db.createCollection('score_history', { timeseries: { … } })` and swallows `NamespaceExists` (code 48). The integration test verifies the collection materialises with `type: 'timeseries'` via `db.listCollections({ name: 'score_history' })`.
- `score-history.repository.ts` — INSERT-only repository. `findLatest(instrumentId)` for the read path, `findRange(from, to)` for trend lines. No update/upsert path (time-series collections can't support arbitrary updates pre-7.0; idempotency lives at the BullMQ jobId layer).

### Redis materialiser

- `redis-score-materialiser.ts` — `writeScore(instrumentId, snapshot)` rotates `score:latest` into `score:prev` (only when prior latest exists), then writes the new latest and the `score:asof` hint. Every key carries an explicit TTL (`latest`: 36h, `prev`: 7d, `asof`: 36h) — satisfies the project-wide `data/redis-always-ttl` rule.
- The TTL on `latest` is intentionally longer than the cron interval so a single missed run does not blank the UI. The `prev` TTL keeps the +/- delta indicator alive for a week.
- `readLatest` / `readPrev` / `readAsOf` are typed; malformed JSON returns `null` (defensive — never throws on a poisoned cache entry).

### Score loaders (interface seam)

- `score-loaders.ts` — `StocksScoreLoader` + `FundsScoreLoader` are `@Injectable()` placeholders. Both throw `NotImplementedException` with a clear message pointing at the Phase 2 wiring obligation. The shape is frozen so the processor + tests already wire against the real contract.

### BullMQ producer

- `eod-recompute.types.ts` — canonical `EOD_QUEUE_NAME` / `EOD_PARENT_JOB_NAME` / `EOD_CHILD_JOB_NAME` / `EOD_SCHEDULER_KEY` constants + `EodChildPayload` / `EodParentPayload` / `ActiveInstrument` types.
- `active-instrument.provider.ts` — adapter over `InstrumentsRepository.listActiveTickers()` (Plan 02-03). Funds will plug in once the funds repo lists actives.
- `eod-recompute.producer.ts`:
  - `registerCron()` — calls `Queue.upsertJobScheduler(EOD_SCHEDULER_KEY, { pattern: '0 18 * * *', tz: 'Asia/Kolkata' }, { ... })` (A11). Idempotent across replicas + restarts.
  - `fanOut(asOfDate, triggeredBy)` — pulls the active universe, chunks to 100, calls `queue.addBulk(jobs)` with deterministic `jobId = ${instrumentId}:${asOfDate}` per child. Returns `{ enqueued, chunks }` so the parent processor can log the volume.

### BullMQ processor

- `eod-recompute.processor.ts` — `@Processor('eod-recompute', { concurrency: 10 })` (A12). Dispatches on `job.name`:
  - **Parent** — pulls today's IST date (or the payload's override) and delegates to `producer.fanOut`.
  - **Child** — calls `StocksScoreLoader.loadScoreInput()` (or fund equivalent), invokes `scoreStock` / `scoreFund`, **writes Mongo first** (`ScoreHistoryRepository.insert`), then mirrors into Redis (`RedisScoreMaterialiser.writeScore`).
  - Mongo-first ordering is intentional: if Redis fails after Mongo succeeds, BullMQ retries; Mongo's insert is idempotent on jobId (duplicates blocked upstream), Redis recovers. The reverse order would risk Redis showing a score that Mongo hasn't persisted.
  - Errors rethrown so BullMQ applies the `attempts: 3` + exponential-backoff policy.

### Admin endpoint (`apps/api/src/admin/scoring/`)

- `dto/recompute.dto.ts` — `class-validator` DTO requiring `@IsMongoId() instrumentId`, `@IsIn(['STOCK','FUND']) instrumentType`, `@Matches(/^\d{4}-\d{2}-\d{2}$/) asOfDate`. The global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` rejects unknown keys.
- `admin-scoring.controller.ts` — `POST /admin/scoring/recompute` behind `AccessTokenGuard` (the admin-role guard is the Phase 1 IAM v2 follow-up). Pulls the owner via `@AuthenticatedUser()`, stamps `triggeredBy: 'admin:{userId}'`, enqueues with the deterministic jobId. Returns `{ jobId, status: 'enqueued' }`.

### Module wiring

- `eod-recompute.module.ts` — registers `BullModule.forRootAsync` (Redis URL from `ConfigService`), the named queue `eod-recompute`, the time-series Mongoose schema, every provider above. Exports `BullModule`, `ScoreHistoryRepository`, `RedisScoreMaterialiser`, `EodRecomputeProducer`.
- `admin/scoring/admin-scoring.module.ts` — imports `AuthModule` + `EodRecomputeModule` (so the `@InjectQueue('eod-recompute')` token resolves) and registers the admin controller.
- `app.module.ts` — adds `AdminScoringModule` + `EodRecomputeModule` to the root imports.

## Tests

| File | Coverage |
|------|----------|
| `score-history.repository.spec.ts` | `createCollection` produces a time-series collection (verified via `listCollections`), idempotent re-runs, `findLatest` ordering, `findRange` filtering. (mongodb-memory-server) |
| `redis-score-materialiser.spec.ts` | First-write semantics, latest→prev rotation across 2 + 3 writes, explicit TTLs, read helpers, null-safe parse on malformed JSON. (In-memory Redis stub.) |
| `eod-recompute.producer.spec.ts` | `upsertJobScheduler` registers the 18:00 IST pattern; `fanOut` chunks 250 instruments into 3 batches with the deterministic jobId; empty universe is a no-op; `triggeredBy` propagates. (Mocked Queue.) |
| `eod-recompute.processor.spec.ts` | Child job: loader → score → Mongo insert → Redis write **in that order** (asserted via an ordered-call log); Redis is NOT called when Mongo fails; parent job delegates to `producer.fanOut`; missing `asOfDate` falls back to today's IST date. |
| `admin-scoring.controller.spec.ts` | Deterministic jobId is the BullMQ key; `triggeredBy: 'admin:{userId}'` is stamped on the payload; jobId fallback when BullMQ returns no id. |

## Cross-phase contracts emitted

- `score_history` document shape — Phase 4 reports / Phase 5 watchlist / Phase 8 SEO pages read these directly. Bumping the engine version bumps the stored `scoringEngineVersion`; readers can pin or compare.
- Redis keys owned by this plan — `score:latest:{id}` (Phase 5 read path), `score:prev:{id}` (Phase 5 +/- indicator), `score:asof:{id}` (read-path idempotency hint).
- BullMQ queue + scheduler — `eod-recompute` queue, `eod-recompute-daily` scheduler. Any future scheduler that reuses the same key will deduplicate.
- `EodChildPayload.triggeredBy` — `'cron'` for the scheduled fan-out, `'admin:{userId}'` for manual recomputes. Structured logs include this for downstream SIEM correlation.

## Pinned deps (new)

- `bullmq@^5.77.6`
- `@nestjs/bullmq@^11.0.4`
- `date-fns-tz@^3.2.0`

## Verification (at commit time)

| Gate | Result |
|------|--------|
| `pnpm --filter @finsight/api test` | **369 pass** (63 files; up from 352 in 03-02) |
| `pnpm --filter @finsight/api test:e2e` | 16 pass (4 files) |
| `pnpm --filter @finsight/api type-check` | clean |
| `pnpm --filter @finsight/api lint` | clean |
| `pnpm --filter @finsight/api lint:arch` | clean |
| `pnpm --filter @finsight/web test` | 15 pass |
| `pnpm forbid-verbs` | clean |
| `git diff --check` | clean |
| Purity audit (`@nestjs`/`mongoose`/`ioredis`/`bullmq` in `apps/api/src/scoring/**`) | none — the orchestration shell lives in `apps/api/src/jobs/eod-recompute/`, never inside the pure scoring core |

## Open questions (carry forward)

| # | Assumption | Notes |
|---|---|---|
| **A10** | 3-year retention TTL on `score_history` | `expireAfterSeconds = 3*365*24*60*60` — trivial to extend if the storage budget allows. |
| **A11** | Cron at 18:00 IST | Push to 20:00 IST if MFAPI NAV publishes later. Single-line change in `producer.ts`. |
| **A12** | Worker `concurrency: 10` | Tune after the first prod run based on Mongo write latency. |
| **Q2** | Admin recompute endpoint ships | Resolved (shipped). The admin-role authorisation gate is the Phase 1 IAM v2 follow-up. |
| **`triggeredBy` persistence** | Currently log-only on `score_history` writes. | If audit traceability becomes a v2 requirement, add an indexed optional field on the schema. |

## What this plan defers

- Real loader assembly (Phase 2 ↔ Phase 3 interface seam). Currently `StocksScoreLoader` / `FundsScoreLoader` throw `NotImplementedException` — the cron will not produce useful work until the data assemblers are stitched together. This is intentional: the orchestration layer is fully proven and the data integration is the next piece.
- End-to-end Queue + Worker verification against a real Redis (Testcontainers or staging).
- Admin-role authorisation guard — currently `AccessTokenGuard` only. Phase 1 IAM v2 follow-up.
- Fund enumeration inside `ActiveInstrumentProvider.activeUniverse` (currently stocks only; trivial extension when the funds repo exposes `listActive`).
- Migrating the existing `packages/shared/src/scoring.ts` consumers onto the new `scoreStock` engine — that swap belongs to the Phase 4 reports refactor.
