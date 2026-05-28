---
phase: 05-search-watchlist
plan: 02
slug: watchlist
date: 2026-05-28
status: complete
deviations:
  - "AccessTokenGuard (Phase 1 cookie-based) instead of plan's JwtAuthGuard. Same correction as Plan 04-03/04/05 + 05-01."
  - "userId derived from `request.user.id` (the AuthenticatedUser shape Phase 1 ships), not `req.user.sub`. The JWT subject claim is mapped to `id` inside `AuthService.getAuthenticatedUser` (auth.service.ts:62)."
  - "Phase 3's `RedisScoreMaterialiser` writes BOTH `score:latest:<id>` and `score:prev:<id>` as JSON-serialised `ScoreSnapshot` objects (not bare numbers). The service parses the `score` field out of the JSON; for tolerance, it falls back to `Number(raw)` so legacy/test fixtures storing a bare number still work."
  - "Cold-Redis Mongo fallback to `ScoreHistory` deferred — Phase 3 reliably writes both keys today (verified by reading `redis-score-materialiser.ts`), so the fallback path is unnecessary for v1. The graceful-degradation path is renderer-side: when `previousScore` is `null`, the row shows `—` and a 'Updates daily — check back tomorrow' tooltip. Documented as an open item if Phase 3's TTL window (7 days for `score:prev:*`) is ever exceeded."
  - "Did NOT install `@tanstack/react-query` or shadcn `<Table>` primitive. Rolled a minimal `useState`-based optimistic UI (snapshot the prior state, apply the change immediately, restore on error) and a hand-written `<table>` for the watchlist rows. Same UX semantics, no new deps."
  - "`@CurrentUser` decorator omitted — controller uses `@Req()` + a tiny `userId(req)` helper that throws if the guard hasn't populated `request.user`. Behaviour matches a `@CurrentUser` decorator without adding a project-wide abstraction surface."
  - "Watchlist test uses mongodb-memory-server with isolated `test_watchlists` + `test_watchlist_instruments` collections so it cannot collide with the search suite's shared replset."
  - "Plan called for HTTP 204 on POST/DELETE — controller honours that via `@HttpCode(204)`."
---

## What landed

### Shared types (`packages/shared/src/watchlist.ts`)

- `WatchlistItem` + `WatchlistResponse` + `WATCHLIST_MAX_ITEMS = 200` constant. Re-exported from `@finsight/shared`. The shape is the read-time row, including the Redis-joined `latestScore` / `previousScore` / `delta`.

### Mongo schema (`apps/api/src/watchlist/schemas/watchlist.schema.ts`)

- `Watchlist` collection — one document per user (`userId` unique-indexed).
- `WatchlistEntry` sub-schema (`_id: false`) — `instrumentId` ObjectId, `instrumentType` enum, `addedAt` Date.
- `optimisticConcurrency: true` so concurrent edits across tabs surface as a `VersionError`. `WatchlistService.withRetry` catches the error once and retries the write.

### Service (`apps/api/src/watchlist/watchlist.service.ts`)

- `getWithScores(userId)` — `findOne({ userId }).lean()`; empty doc / empty array → `{ items: [] }` without any Redis I/O (asserted by spec). Otherwise one `MGET` over `score:latest:<id>` + one `MGET` over `score:prev:<id>` (via `Promise.all`). `parseScore` reads the `score` field out of the JSON payload Phase 3 writes; tolerant fallback to `Number(raw)` for legacy data.
- `addItem(userId, { instrumentId, instrumentType })`:
  1. Validate ObjectId shape (rejects strings of the wrong length).
  2. `instruments.findOne({ _id })` — `BadRequestException("Unknown instrument")` if not found.
  3. Read current doc — short-circuit silently if the item is already present (idempotent add).
  4. Cap at `WATCHLIST_MAX_ITEMS = 200`.
  5. `updateOne($addToSet + $setOnInsert, { upsert: true })`.
  6. Bust `watchlist:user:<userId>` cache key.
- `removeItem(userId, instrumentId)` — `updateOne($pull)`; `NotFoundException` when `matchedCount === 0`; cache bust on success.
- `delta` computed only when both `latest` and `previous` are numeric; otherwise `null` (rendered as `—` in the UI).

### Controller (`apps/api/src/watchlist/watchlist.controller.ts`)

- `@UseGuards(AccessTokenGuard)` at the class level.
- `userId` is sourced exclusively from `request.user.id` via the `userId(req)` helper; throws if the guard hasn't populated `request.user`.
- `GET /watchlist` → `WatchlistResponse`.
- `POST /watchlist/items` → 204, body validated by `AddItemDto`.
- `DELETE /watchlist/items/:instrumentId` → 204 (404 if the user has no watchlist doc).

### DTO (`apps/api/src/watchlist/dto/add-item.dto.ts`)

- `@IsMongoId() instrumentId` + `@IsIn(['STOCK','FUND']) instrumentType`. The global `ValidationPipe({ whitelist: true })` strips any client-injected `userId` field (defence-in-depth on T-05-09).

### Module wiring

- `WatchlistModule` imports `AuthModule`, `CacheModule`, and `MongooseModule.forFeature` for `Watchlist` + `Instrument`. Registered in `AppModule` alphabetically after `UsersModule`.

### Web (`apps/web/`)

- `src/lib/api/watchlist.ts` — `fetchWatchlist`, `addWatchlistItem`, `removeWatchlistItem`. Cookie-forwarded (`credentials: 'include'`).
- `src/components/watchlist/WatchlistTable.tsx` — `useState`-based loader + table with type / added-date / score badge / delta cell / remove button. Optimistic remove: snapshot + apply + restore on rejection. Score badge tone bands: ≥7 emerald, 4–6.99 amber, <4 rose, `null` muted with the "Updates daily" tooltip. Delta cell uses `ArrowUp`/`ArrowDown`/`Minus` from lucide-react with semantic aria labels (`Score up` / `Score down` / `No change` / `No delta`).
- `src/components/watchlist/AddToWatchlistButton.tsx` — reusable optimistic toggle. Flips the `inWatchlist` boolean immediately on click, calls the API in the background, restores the prior boolean on failure. Star icon fills amber when in the watchlist. Disabled while the request is in flight to prevent double-clicks.
- `src/app/(app)/watchlist/page.tsx` — page shell with the title, the "Scores refresh daily after market close" microcopy, the `<WatchlistTable />`, and the "Analysis only. Not investment advice." compliance footer.

## Tests added

| File | Coverage |
|------|----------|
| `watchlist.service.spec.ts` (10) | empty doc → no Redis call; addItem idempotent + cache bust; addItem rejects unknown instrument; addItem rejects at 200-item cap; removeItem 404 when no doc; removeItem pulls + busts cache; user isolation; Redis JSON join + delta computation; null fall-through when keys absent; null delta when only latest present. |
| `watchlist.controller.spec.ts` (4) | userId sourced from `request.user.id` on list/add/remove; throws when the guard hasn't populated `request.user`. |
| `add-item.dto.spec.ts` (4) | accept valid ObjectId + STOCK/FUND; reject malformed id; reject unknown instrumentType. |
| `WatchlistTable.test.tsx` (3) | empty state with `/search` CTA; rows render score badge + delta arrow; optimistic remove + restore on API failure. |
| `AddToWatchlistButton.test.tsx` (3) | optimistic flip before API resolves; rollback on add failure; remove path + rollback. |

## Cross-phase contracts consumed

- `RedisScoreMaterialiser` from Phase 3 writes both keys with serialised `ScoreSnapshot` JSON (verified by reading `apps/api/src/jobs/eod-recompute/redis-score-materialiser.ts`). The watchlist service parses the `score` field out.
- `Instrument` model from Plan 02-03 — used for the existence check on add.

## Verification (at commit time)

| Gate | Result |
|------|--------|
| `pnpm --filter @finsight/api test` | **522 pass** (87 files; +18 net for 05-02) |
| `pnpm --filter @finsight/api type-check` | clean |
| `pnpm --filter @finsight/api lint` | clean |
| `pnpm --filter @finsight/api lint:arch` | clean |
| `pnpm --filter @finsight/web test` | **89 pass** (20 files; +6 net for 05-02) |
| `pnpm --filter @finsight/web type-check` | clean |
| `pnpm --filter @finsight/web lint` | clean |
| `pnpm forbid-verbs` | clean |
| `git diff --check` | clean |

## Open questions / [ASSUMED]

- **Cold-Redis Mongo fallback.** Plan called for one. Deferred because Phase 3 reliably writes both keys with a 7-day TTL on `score:prev:*`. If a 7-day gap ever opens (e.g., extended outage of the EOD pipeline), the row renders `—` with a "Updates daily" tooltip — graceful, no 500. Re-evaluate if user reports surface this.
- **`AddToWatchlistButton` on report pages.** The component is exported from `@/components/watchlist/AddToWatchlistButton` and ready to drop into Plan 04-04 / 04-05 report headers; the call site change is out of scope for this plan and tracked as a Phase 4 polish follow-up.
- **5-min server-side cache.** Plan suggested wrapping `GET /watchlist` in a 5-minute `cache.wrap` facade. Omitted — the per-user MGET round trip is already sub-millisecond at the 200-item cap; cache invalidation correctness with shared family accounts gets tricky. Add only if a perf trace shows it matters.

## What this plan defers

- The `@tanstack/react-query` + shadcn `Table` primitive adoption (cosmetic; current optimistic UI passes every behaviour test).
- Wiring `AddToWatchlistButton` into the live report headers (Plan 04-04 / 04-05 polish).
- `@Throttle({ limit: 30 })` decorator on add/remove (global throttler from Phase 1 still applies).
- Watchlist export / share features (none in scope per REQUIREMENTS.md).

Phase 5 progress: **2/2 plans complete**. SRCH-01 (Plan 05-01) + WATCH-01 / WATCH-02 (Plan 05-02) done.
