---
phase: 05-search-watchlist
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/watchlist/watchlist.module.ts
  - apps/api/src/watchlist/watchlist.controller.ts
  - apps/api/src/watchlist/watchlist.service.ts
  - apps/api/src/watchlist/schemas/watchlist.schema.ts
  - apps/api/src/watchlist/dto/add-item.dto.ts
  - apps/api/src/watchlist/dto/watchlist-response.dto.ts
  - apps/api/src/watchlist/watchlist.service.spec.ts
  - apps/api/src/watchlist/watchlist.controller.spec.ts
  - apps/api/src/watchlist/dto/add-item.dto.spec.ts
  - apps/api/src/app.module.ts
  - packages/shared/src/watchlist/watchlist-item.ts
  - packages/shared/src/index.ts
  - apps/web/src/lib/api/watchlist.ts
  - apps/web/src/components/watchlist/watchlist-table.tsx
  - apps/web/src/components/watchlist/add-to-watchlist-button.tsx
  - apps/web/src/components/watchlist/watchlist-mutations.test.tsx
  - apps/web/src/components/ui/table.tsx
  - apps/web/src/components/ui/badge.tsx
  - apps/web/src/app/(authed)/watchlist/page.tsx
  - apps/web/package.json
autonomous: true
requirements:
  - WATCH-01
  - WATCH-02

must_haves:
  truths:
    - "An authenticated user can POST /watchlist/items with an `instrumentId` and have it persisted in their personal watchlist."
    - "An authenticated user can DELETE /watchlist/items/:id and have it removed."
    - "An unknown `instrumentId` returns 400 (validated against the instrument master)."
    - "Watchlist size is capped at 200 items (DTO validator rejects the 201st add)."
    - "GET /watchlist returns every item with `latestScore`, `previousScore`, and `delta` joined from Redis via a single MGET."
    - "When Redis is cold (or only `score:latest` exists), `previousScore` is `null` — no crash, no 500."
    - "User A's watchlist is fully isolated from user B (filter always derived from JWT `req.user.sub`)."
    - "Add/remove busts the per-user Redis cache key `watchlist:user:{userId}` before returning."
    - "Frontend renders watchlist as a table with score badge + up/down arrow indicator, with optimistic UI on add/remove."
    - "Watchlist refreshes the score column daily (via Phase 3 EOD job writes — no Phase 5 cron required)."
  artifacts:
    - path: "apps/api/src/watchlist/schemas/watchlist.schema.ts"
      provides: "Watchlist schema — per-user single doc, optimisticConcurrency true, unique index on userId"
      contains: "optimisticConcurrency"
    - path: "apps/api/src/watchlist/watchlist.service.ts"
      provides: "WatchlistService.getWithScores / addItem / removeItem — Redis MGET join + cache bust"
      min_lines: 80
    - path: "apps/api/src/watchlist/watchlist.controller.ts"
      provides: "GET /watchlist, POST /watchlist/items, DELETE /watchlist/items/:id — JwtAuthGuard"
      exports: ["WatchlistController"]
    - path: "apps/api/src/watchlist/dto/add-item.dto.ts"
      provides: "AddItemDto — IsMongoId on instrumentId, IsIn STOCK|FUND on instrumentType; collection-level @ArrayMaxSize(200) enforced in service"
      contains: "class AddItemDto"
    - path: "apps/api/src/watchlist/watchlist.service.spec.ts"
      provides: "Integration tests for WATCH-01 / WATCH-02 — Redis MGET join, cold-Redis null path, user isolation, cap-200, cache bust"
      min_lines: 150
    - path: "apps/web/src/components/watchlist/watchlist-table.tsx"
      provides: "Server-fetched table with score badge + delta arrow, react-query backed"
      min_lines: 60
    - path: "apps/web/src/components/watchlist/add-to-watchlist-button.tsx"
      provides: "Optimistic add/remove toggle button — react-query useMutation with onMutate rollback"
      min_lines: 40
    - path: "packages/shared/src/watchlist/watchlist-item.ts"
      provides: "Shared WatchlistItem + WatchlistResponse types"
      exports: ["WatchlistItem", "WatchlistResponse"]
  key_links:
    - from: "apps/api/src/watchlist/watchlist.service.ts"
      to: "ioredis MGET on score:latest:* and score:prev:*"
      via: "Promise.all of two mget calls"
      pattern: "this\\.redis\\.mget"
    - from: "apps/api/src/watchlist/watchlist.service.ts"
      to: "WatchlistModel.updateOne with $addToSet/$pull"
      via: "atomic Mongo update + upsert true on add"
      pattern: "\\$addToSet|\\$pull"
    - from: "apps/api/src/watchlist/watchlist.controller.ts"
      to: "req.user.sub (JWT-derived userId)"
      via: "controller takes userId from request.user, NEVER from body/path"
      pattern: "req\\.user\\.sub|@CurrentUser"
    - from: "apps/web/src/components/watchlist/watchlist-table.tsx"
      to: "GET /watchlist"
      via: "useQuery + react-query"
      pattern: "useQuery\\([^)]*queryKey:\\s*\\['watchlist'"
    - from: "apps/web/src/components/watchlist/add-to-watchlist-button.tsx"
      to: "POST /watchlist/items, DELETE /watchlist/items/:id"
      via: "useMutation onMutate optimistic + onError rollback + onSettled invalidate"
      pattern: "onMutate|onError|onSettled"
    - from: "Phase 3 EOD job"
      to: "Redis keys score:latest:{instrumentId} and score:prev:{instrumentId}"
      via: "Phase 3 contract — Plan 02 only READS these keys"
      pattern: "score:(latest|prev):"
---

<objective>
Deliver `WATCH-01` (add/remove from personal watchlist) and `WATCH-02` (daily-refreshed score on each row).

- Per-user single Mongoose document with `optimisticConcurrency: true` (concurrent edits across tabs surface as `VersionError`, retried once).
- DTO-validated, JWT-scoped CRUD: POST /watchlist/items, DELETE /watchlist/items/:id, GET /watchlist.
- Score join via Redis `MGET` against `score:latest:{instrumentId}` + `score:prev:{instrumentId}` (Pattern D in 05-RESEARCH.md). NOT `$lookup`.
- Cold-Redis safety: if Phase 3 hasn't written the `score:prev:*` key yet (or it expired), fallback to a single `ScoreHistory.find({ instrumentId: { $in: ids } }).sort({ date: -1 }).limit(2 * ids.length)` query in Mongo. Both keys absent → `null` rendered as "Updates daily — check back tomorrow" in the UI.
- Optimistic UI on the web: react-query `useMutation` with `onMutate` rolls back on error.

Purpose: Closes the "search → add → revisit" loop. The watchlist page is the second-most-visited screen after a report. Daily score deltas with up/down arrows are the entire point of WATCH-02 — they need to be obviously visible.

Output: Working watchlist API + page + button, plus the cross-phase Redis read contract documented and exercised.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md
@.planning/ROADMAP.md
@.planning/research/SUMMARY.md
@.planning/research/STACK.md
@.planning/phases/05-search-watchlist/05-RESEARCH.md
@apps/api/src/instruments/schemas/instrument.schema.ts
@apps/api/src/auth
@apps/api/src/cache

<cross_phase_contracts>
1. **Phase 3 EOD job MUST write BOTH `score:latest:{instrumentId}` and `score:prev:{instrumentId}` to Redis** (Assumption A3 in 05-RESEARCH.md).
   - Plan 02 only READS these keys — never writes them.
   - Defensive: if `score:prev:*` is missing on read, fall back to a single batched Mongo query against `ScoreHistory`. Document this fallback in the SUMMARY.
   - If grep across the codebase shows Phase 3 wrote ONLY `score:latest:*` (not `score:prev:*`), file a Phase 3 follow-up issue AND keep the Mongo fallback for resilience.

2. **Phase 2 instrument master** — `Instrument` model and the `InstrumentsService` (or whatever existence-check service Phase 2 exposes). Plan 02 calls `instrumentsService.exists(id)` on every `addItem` so an unknown ObjectId returns 400, not a silent watchlist row that crashes the score join later.
   - If Phase 2 didn't export an `exists()` method, add `findOne({ _id }, { _id: 1 }).lean()` directly in the watchlist service. Single-line read, no cross-module patch required.

3. **Phase 1 CacheModule** — exposes `cache.del(key)`. Confirm by reading `apps/api/src/cache`. If the facade exports a different method name (e.g., `cacheManager.del`), match it.

4. **Phase 1 auth** — `JwtAuthGuard` + a `@CurrentUser()` decorator OR `req.user.sub`. Read the pattern used by Phase 1 auth-protected controllers and mirror it exactly. Never accept `userId` from request body/query/path.

5. **ioredis instance** — Phase 1 should have wired a singleton `Redis` provider (`'REDIS_CLIENT'` token or similar). Inject the same instance — do not new-up another connection.
</cross_phase_contracts>

<interfaces>
<!-- Contracts the executor must implement against. -->

```typescript
// packages/shared/src/watchlist/watchlist-item.ts
import type { InstrumentType } from '../search/instrument-match';

export interface WatchlistItem {
  instrumentId: string;
  instrumentType: InstrumentType;
  addedAt: string;          // ISO
  latestScore: number | null;
  previousScore: number | null;
  delta: number | null;     // latestScore - previousScore, null if either is null
}

export interface WatchlistResponse {
  items: WatchlistItem[];
}
```

```typescript
// apps/api/src/watchlist/watchlist.service.ts
export class WatchlistService {
  getWithScores(userId: string): Promise<WatchlistResponse>;
  addItem(userId: string, dto: { instrumentId: string; instrumentType: 'STOCK' | 'FUND' }): Promise<void>;
  removeItem(userId: string, instrumentId: string): Promise<void>;
}
```

```typescript
// apps/api/src/watchlist/dto/add-item.dto.ts
export class AddItemDto {
  @IsMongoId() instrumentId!: string;
  @IsIn(['STOCK', 'FUND']) instrumentType!: 'STOCK' | 'FUND';
}
```

```typescript
// HTTP shape
// POST /watchlist/items     body: AddItemDto              -> 204
// DELETE /watchlist/items/:instrumentId                   -> 204 (404 if no doc)
// GET /watchlist                                          -> WatchlistResponse
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 0 (Wave 0): Test scaffolding for watchlist API + UI + shared types</name>
  <files>
    apps/api/src/watchlist/watchlist.service.spec.ts,
    apps/api/src/watchlist/watchlist.controller.spec.ts,
    apps/api/src/watchlist/dto/add-item.dto.spec.ts,
    apps/web/src/components/watchlist/watchlist-mutations.test.tsx,
    packages/shared/src/watchlist/watchlist-item.ts,
    packages/shared/src/index.ts
  </files>
  <behavior>
    Tests fail first. Coverage:

    `watchlist.service.spec.ts` (integration — uses in-memory or test Mongo + mocked ioredis):
      1. `getWithScores(userId)` for a user with 3 watchlisted items → returns 3 items, each with `latestScore`, `previousScore`, `delta` populated from Redis MGET fixture (e.g., latest=[7,5,8], prev=[6,5,7] → delta=[+1, 0, +1]).
      2. Cold-Redis fallback: when Redis returns `[null, null, null]` for `score:prev:*`, the service queries `ScoreHistory.find({ instrumentId: { $in: ids } }).sort({ date: -1 })` and uses the 2nd-most-recent doc per instrument as previousScore. Mock the ScoreHistory model.
      3. Falsy values (`null`, empty string) from Redis render as `null` (NOT NaN) in the response.
      4. Empty watchlist (`items: []`) returns `{ items: [] }` without calling Redis MGET (spy assertion).
      5. `addItem(userA, { instrumentId, instrumentType: 'STOCK' })` calls `cache.del('watchlist:user:userA')` AFTER the Mongo write — assert call order via spy.
      6. `removeItem(userA, instrumentId)` on a user with no doc throws `NotFoundException`.
      7. User isolation: seed user A with 2 items, user B with 1 item, `getWithScores('A')` returns exactly A's 2 items (assert by instrumentId set).
      8. Watchlist size cap 200: pre-seed 200 items on a user, attempt `addItem` for a new one → throws `BadRequestException('Watchlist limit reached (200)')`.
      9. Unknown instrumentId: `addItem` with a valid ObjectId that has no corresponding Instrument doc → throws `BadRequestException`.
      10. Concurrent edit: simulate `VersionError` on `updateOne`, the service retries once, second attempt succeeds.

    `watchlist.controller.spec.ts` (NestJS Test module):
      1. Without JWT → 401 (JwtAuthGuard).
      2. With JWT → controller calls service with `req.user.sub` as userId (NOT any client value).
      3. POST body `{ instrumentId: 'not-a-mongoid' }` → 400 (DTO validator).
      4. POST body `{ instrumentType: 'BOND' }` → 400 (DTO validator IsIn).
      5. DELETE returns 204 on success, 404 if service throws NotFoundException.

    `add-item.dto.spec.ts` (pure unit):
      - Valid Mongo ObjectId 24-hex passes.
      - 23-char hex fails.
      - Missing instrumentType fails.

    `watchlist-mutations.test.tsx` (Vitest + RTL):
      1. Click "Add to watchlist" — the list updates IMMEDIATELY (optimistic), before the API mock resolves.
      2. API rejects → list rolls back to prior state (`onError` restores).
      3. Click "Remove" — item disappears immediately; on error, reappears.
      4. After mutation settles, `queryClient.invalidateQueries({ queryKey: ['watchlist'] })` was called (spy).

    `packages/shared/src/watchlist/watchlist-item.ts` — exports per &lt;interfaces&gt; block.
  </behavior>
  <action>
    1. Create `packages/shared/src/watchlist/watchlist-item.ts` with the types from &lt;interfaces&gt;. Add re-export in `packages/shared/src/index.ts`.

    2. Create `apps/api/src/watchlist/watchlist.service.spec.ts`. Use `MongooseTestModule` if Phase 1 set one up, otherwise `mongodb-memory-server` (already in devDeps after Phase 2 — confirm). Mock ioredis with a simple in-memory implementation (or `ioredis-mock` if Phase 1 added it):
       ```ts
       const redisMock = { mget: vi.fn(), del: vi.fn() };
       ```
       Write all 10 cases above. Each test should be tight (Arrange / Act / Assert) and the file ≤ 350 lines.

    3. Create `apps/api/src/watchlist/watchlist.controller.spec.ts` using `Test.createTestingModule(...).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })`. For the JWT failure case, leave the real guard in and stub the strategy to reject.

    4. Create `apps/api/src/watchlist/dto/add-item.dto.spec.ts` — pure unit, no Nest module needed.

    5. Create `apps/web/src/components/watchlist/watchlist-mutations.test.tsx`. Wrap renders in a fresh `QueryClientProvider` per test (standard react-query test pattern). Mock the API client (`apps/web/src/lib/api/watchlist`) with `vi.mock`.

    6. Run tests: `pnpm --filter api test -- --testPathPattern=watchlist` and `pnpm --filter web test -- watchlist-mutations --run`. All MUST fail/error (RED — no implementation exists).

    7. Commit: `test(05-02): add failing tests for WATCH-01 WATCH-02 service/controller/DTO/UI`
  </action>
  <verify>
    <automated>cd /Users/milankatia/Desktop/personal/tracker && pnpm --filter api test -- --testPathPattern=watchlist 2>&1 | tail -40; pnpm --filter web test -- watchlist-mutations --run 2>&1 | tail -20</automated>
    All test files exist; all tests fail or error with "Cannot find module" — that's the expected RED state. typecheck on the test files themselves passes (because the &lt;interfaces&gt; types in shared exist and the spec only references types that exist).
  </verify>
  <done>
    - 6 new files (2 shared, 4 test).
    - Commit message exactly: `test(05-02): add failing tests for WATCH-01 WATCH-02 service/controller/DTO/UI`.
    - Running watchlist test pattern produces an unambiguous failure log (module not found / undefined class).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 1 (GREEN): Watchlist Mongoose schema + service + controller + DTO + Redis join + cache bust</name>
  <files>
    apps/api/src/watchlist/schemas/watchlist.schema.ts,
    apps/api/src/watchlist/dto/add-item.dto.ts,
    apps/api/src/watchlist/dto/watchlist-response.dto.ts,
    apps/api/src/watchlist/watchlist.service.ts,
    apps/api/src/watchlist/watchlist.controller.ts,
    apps/api/src/watchlist/watchlist.module.ts,
    apps/api/src/app.module.ts
  </files>
  <behavior>
    All Task 0 API tests (10 service cases, 5 controller cases, DTO cases) flip GREEN.

    Schema:
      - `Watchlist` collection, per-user, `userId` unique-indexed, `optimisticConcurrency: true`, embedded `instruments: WatchlistItem[]`.
      - Per Code Example 4 in 05-RESEARCH.md.

    Service behavior:
      - `getWithScores(userId)` — `findOne({ userId }).lean()`. Empty → `{ items: [] }`. Else build `latestKeys`, `prevKeys`, `Promise.all([redis.mget(...latestKeys), redis.mget(...prevKeys)])`.
      - **Cold-Redis fallback**: if EVERY value in `prev` is null, run one `scoreHistoryModel.find({ instrumentId: { $in: ids } }).sort({ instrumentId: 1, date: -1 })` and group-by-instrumentId to extract the 2nd-most-recent value per id. (Inject `ScoreHistory` model from Phase 3 — read `apps/api/src/scoring/schemas` to find the export name.)
      - **NO** loop-per-item Mongo calls (Pitfall 4 — explicit guard in the test).
      - `delta = latest - previous` only when both are numbers; else `null`.

      - `addItem(userId, { instrumentId, instrumentType })`:
        1. `await instrumentsService.exists(instrumentId)` (or inline `findOne({_id: id}, {_id:1}).lean()`) — throw `BadRequestException('Unknown instrument')` if not found.
        2. Read current doc's array length; if `>= 200` throw `BadRequestException('Watchlist limit reached (200)')`.
        3. `updateOne({ userId }, { $addToSet: { instruments: { instrumentId: new Types.ObjectId(instrumentId), instrumentType, addedAt: new Date() } }, $setOnInsert: { userId } }, { upsert: true })`.
        4. `await cache.del('watchlist:user:' + userId)`.
        5. Wrap step 3 in a single-retry-on-VersionError helper (per Pattern C optimistic concurrency).

      - `removeItem(userId, instrumentId)`:
        1. `const res = await model.updateOne({ userId }, { $pull: { instruments: { instrumentId: new Types.ObjectId(instrumentId) } } })`.
        2. If `res.matchedCount === 0` throw `NotFoundException`.
        3. `await cache.del('watchlist:user:' + userId)`.

    Controller:
      - All routes under `@Controller('watchlist')` with `@UseGuards(JwtAuthGuard)`.
      - GET `/` → `service.getWithScores(req.user.sub)`. Wrap in a Phase 1 `cache.wrap('watchlist:user:' + userId, 300, ...)` if the CacheModule facade supports it; else just return the service result (5-min cache is a perf nice-to-have, not blocking).
      - POST `/items` → `@HttpCode(204)`, `await service.addItem(req.user.sub, dto)`.
      - DELETE `/items/:instrumentId` → `@HttpCode(204)`, `@Param('instrumentId') @IsMongoId()` validated, `await service.removeItem(req.user.sub, id)`.
      - Use the `@CurrentUser()` decorator pattern if Phase 1 introduced one; else `@Req() req` and cast `req.user`.

    DTO: per &lt;interfaces&gt;.
  </behavior>
  <action>
    1. Create `apps/api/src/watchlist/schemas/watchlist.schema.ts` exactly per 05-RESEARCH.md Code Example 4. Add the `@Schema({ _id: false })` inner `WatchlistItem` class with `instrumentId: ObjectId`, `instrumentType: 'STOCK' | 'FUND'`, `addedAt: Date`. Outer `@Schema({ collection: 'watchlists', timestamps: true, optimisticConcurrency: true })` `Watchlist` class with `userId` (unique-indexed) and `instruments: WatchlistItem[]`. Export `WatchlistSchema` and `WatchlistDocument`.

    2. Create `apps/api/src/watchlist/dto/add-item.dto.ts` per &lt;interfaces&gt; — minimal, exactly two validated fields.

    3. Create `apps/api/src/watchlist/dto/watchlist-response.dto.ts` — re-export `WatchlistResponse` from `@finsight/shared` (or whatever the actual package name is — confirm).

    4. Create `apps/api/src/watchlist/watchlist.service.ts`:
       - Inject `@InjectModel(Watchlist.name)`, `@InjectModel(Instrument.name)` (for the `exists` check), `@InjectModel(ScoreHistory.name)` (for the cold-Redis fallback — confirm the actual name from Phase 3), and the singleton `Redis` instance, and the `CacheManager`/cache facade.
       - Implement `getWithScores`, `addItem`, `removeItem` per the behavior block.
       - Helper `private withOptimisticRetry<T>(fn: () => Promise<T>): Promise<T>` — catches `VersionError`, retries once with a fresh `findOne`, then rethrows if still failing.
       - Implement the cold-Redis fallback as a private method `private async fallbackPrevFromMongo(instrumentIds: string[]): Promise<Record<string, number | null>>` — single `find().sort().lean()` then JS-side group-by.
       - Add concise JSDoc on each public method noting its security/concurrency posture (e.g., "userId MUST come from JWT — never from client input").

    5. Create `apps/api/src/watchlist/watchlist.controller.ts` per the behavior block. Reuse the auth pattern from an existing protected controller in the repo (read one first — e.g., the Phase 4 stock report controller if it exists, else the Phase 1 auth-test controller).

    6. Create `apps/api/src/watchlist/watchlist.module.ts` — imports MongooseModule.forFeature for Watchlist, Instrument, ScoreHistory; imports CacheModule (already global in Phase 1, but `forFeature`-style if Phase 1 used it); provides WatchlistService + the Redis client provider (reuse Phase 1 token); controllers [WatchlistController]; exports WatchlistService (so future Phase 7 chat tools can read it).

    7. Register `WatchlistModule` in `app.module.ts` imports array (add a single import line + entry — surgical).

    8. Run `pnpm --filter api test -- --testPathPattern=watchlist`. All 16+ API test cases (service + controller + DTO) MUST be GREEN. Iterate until they are.

    9. Run `pnpm --filter api typecheck`, `pnpm --filter api lint`. Clean.

    10. Smoke against dev cluster:
        ```bash
        JWT=$DEV_JWT
        # Seed: pick a real instrument id from the cluster
        IID=$(curl -sS -H "Authorization: Bearer $JWT" 'http://localhost:3001/search/instruments?q=REL' | jq -r '.[0].id')
        curl -sS -X POST -H "Authorization: Bearer $JWT" -H "content-type: application/json" \
          -d "{\"instrumentId\":\"$IID\",\"instrumentType\":\"STOCK\"}" \
          http://localhost:3001/watchlist/items -w '%{http_code}\n'
        # Expect 204
        curl -sS -H "Authorization: Bearer $JWT" http://localhost:3001/watchlist | jq
        # Expect: { items: [{ instrumentId: $IID, ..., latestScore: <number or null>, previousScore: <number or null>, delta: ... }] }
        curl -sS -X DELETE -H "Authorization: Bearer $JWT" http://localhost:3001/watchlist/items/$IID -w '%{http_code}\n'
        # Expect 204
        ```

    11. Commit: `feat(05-02): watchlist API + Redis MGET join + DTO validation for WATCH-01/WATCH-02`
  </action>
  <verify>
    <automated>cd /Users/milankatia/Desktop/personal/tracker && pnpm --filter api typecheck 2>&1 | tail -10 && pnpm --filter api test -- --testPathPattern=watchlist 2>&1 | tail -40 && pnpm --filter api lint 2>&1 | tail -10</automated>
    - All 10 service tests + 5 controller tests + 3 DTO tests GREEN
    - Typecheck clean, lint clean
    - No `$lookup` in `watchlist.service.ts` (assert via `grep -n '\$lookup' apps/api/src/watchlist || echo OK`)
    - `req.user.sub` (or `@CurrentUser`) is the ONLY userId source in `watchlist.controller.ts` (grep)
    - `cache.del` (or facade equivalent) is called in BOTH `addItem` and `removeItem`
  </verify>
  <done>
    - Manual curl smoke as above succeeds (204s on writes, JSON shape on read).
    - Test count: ≥18 watchlist-related test cases pass.
    - Service file `≤` 250 lines (split helpers into a separate file if it grows beyond).
    - `grep -rn 'userId' apps/api/src/watchlist/watchlist.controller.ts` shows userId derived ONLY from `req.user` — never from `@Body()`, `@Param()`, `@Query()`.
    - Cross-phase contract check completed and documented in SUMMARY (Phase 3 writes `score:prev:*` — if not, fallback path is exercised in production and a follow-up issue is filed).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (GREEN): Next.js watchlist page + table + optimistic add/remove button</name>
  <files>
    apps/web/package.json,
    apps/web/src/components/ui/table.tsx,
    apps/web/src/components/ui/badge.tsx,
    apps/web/src/lib/api/watchlist.ts,
    apps/web/src/components/watchlist/watchlist-table.tsx,
    apps/web/src/components/watchlist/add-to-watchlist-button.tsx,
    apps/web/src/app/(authed)/watchlist/page.tsx
  </files>
  <behavior>
    Task 0 web test (`watchlist-mutations.test.tsx`, 4 cases) flips GREEN. User-visible UX:

    - Authenticated `/watchlist` page shows a shadcn `<Table>` with columns: Symbol/Name | Type badge (STOCK/FUND) | Score (1-10, large) | Delta (▲ +1, ▼ -1, — for null) | Remove button.
    - Score column: a colored badge.
      - score ≥ 7: green (uses `bg-green-500/15 text-green-700 dark:text-green-300`)
      - 4 ≤ score < 7: amber
      - score < 4: red
      - score null: muted "—" plus tooltip text "Updates daily — check back tomorrow"
    - Delta column: green ▲ for positive, red ▼ for negative, neutral em-dash for zero/null. Use Lucide icons `ArrowUp`, `ArrowDown`, `Minus` (Lucide is in shadcn baseline).
    - Empty state: a centered message "Your watchlist is empty." + a CTA "Search for instruments" linking to `/search`.
    - Compliance footer: "Analysis only. Not investment advice." + "Scores refresh daily after market close."
    - `<AddToWatchlistButton instrumentId={...} instrumentType={...}>` — read by Phase 4 report pages later, exported from `apps/web/src/components/watchlist/add-to-watchlist-button.tsx`. Toggle behavior:
      - On click while not in watchlist: optimistic-add → server confirm → on error, rollback and toast "Couldn't add to watchlist."
      - On click while in watchlist: optimistic-remove → server confirm → on error, rollback.
      - Button shows `<Star />` (filled when in watchlist, outlined otherwise) — Lucide icon.
  </behavior>
  <action>
    1. Confirm shadcn `table` and `badge` are already installed in the monorepo; if not:
       ```
       pnpm --filter web dlx shadcn@latest add table badge
       ```

    2. Confirm `lucide-react` is in `apps/web/package.json` (shadcn baseline). If not: `pnpm --filter web add lucide-react`.

    3. Create `apps/web/src/lib/api/watchlist.ts`:
       ```ts
       import type { WatchlistResponse, WatchlistItem } from '@finsight/shared';
       const base = '/api/watchlist'; // confirm rewrite/env convention

       export async function fetchWatchlist(): Promise<WatchlistResponse> {
         const res = await fetch(base, { credentials: 'include' });
         if (!res.ok) throw new Error(`Watchlist fetch failed: ${res.status}`);
         return res.json();
       }
       export async function addWatchlistItem(input: { instrumentId: string; instrumentType: 'STOCK' | 'FUND' }): Promise<void> {
         const res = await fetch(`${base}/items`, {
           method: 'POST',
           headers: { 'content-type': 'application/json' },
           credentials: 'include',
           body: JSON.stringify(input),
         });
         if (!res.ok) throw new Error(`Add failed: ${res.status}`);
       }
       export async function removeWatchlistItem(instrumentId: string): Promise<void> {
         const res = await fetch(`${base}/items/${encodeURIComponent(instrumentId)}`, {
           method: 'DELETE',
           credentials: 'include',
         });
         if (!res.ok) throw new Error(`Remove failed: ${res.status}`);
       }
       ```
       Match the existing api-client pattern in `apps/web/src/lib/api/` (read one first).

    4. Create `apps/web/src/components/watchlist/watchlist-table.tsx`:
       ```tsx
       'use client';
       import { useQuery } from '@tanstack/react-query';
       import { fetchWatchlist } from '@/lib/api/watchlist';
       import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
       import { Badge } from '@/components/ui/badge';
       import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
       // ... full implementation per the behavior block
       ```
       - `useQuery({ queryKey: ['watchlist'], queryFn: fetchWatchlist, staleTime: 60_000 })`.
       - Empty-state guard before rendering table.
       - Score badge color logic in a small `scoreVariant(score: number | null)` helper at the top of file.
       - Delta cell: small helper `renderDelta(d: number | null)`.

    5. Create `apps/web/src/components/watchlist/add-to-watchlist-button.tsx`:
       ```tsx
       'use client';
       import { Star } from 'lucide-react';
       import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
       import { addWatchlistItem, removeWatchlistItem, fetchWatchlist } from '@/lib/api/watchlist';
       import { Button } from '@/components/ui/button';
       ```
       Logic:
       - Read current watchlist via `useQuery` (same queryKey, cached).
       - `isInWatchlist = data?.items.some(i => i.instrumentId === props.instrumentId)`.
       - Two mutations (add / remove); each implements `onMutate` (snapshot + optimistic update of `['watchlist']`), `onError` (restore snapshot), `onSettled` (`invalidateQueries({ queryKey: ['watchlist'] })`).
       - Single click handler chooses add or remove based on `isInWatchlist`.
       - Button label: "Add to watchlist" / "Remove from watchlist" (text + Star icon).
       - Toast via sonner if it's already in the monorepo; otherwise a console.error placeholder + a TODO note.

    6. Create `apps/web/src/app/(authed)/watchlist/page.tsx`:
       ```tsx
       import { WatchlistTable } from '@/components/watchlist/watchlist-table';
       export default function WatchlistPage() {
         return (
           <main className="mx-auto max-w-4xl py-8 px-4">
             <header className="mb-6 flex items-end justify-between">
               <h1 className="text-2xl font-semibold">Your Watchlist</h1>
               <p className="text-xs text-muted-foreground">Scores refresh daily after market close.</p>
             </header>
             <WatchlistTable />
             <p className="text-xs text-muted-foreground mt-6">Analysis only. Not investment advice.</p>
           </main>
         );
       }
       ```

    7. Run `pnpm --filter web test -- watchlist-mutations --run` → all 4 GREEN.
    8. Run `pnpm --filter web typecheck` → clean.
    9. Run `pnpm --filter web lint` → clean.
    10. Manual smoke: log in → `/watchlist` shows empty state with CTA → click CTA → on `/search` find RELIANCE → select → ends up on `/stock/RELIANCE.NS` (may 404 if Phase 4 dev) → go back, hit `/watchlist` directly, manually trigger `addWatchlistItem` via dev console → reload → row appears with score badge + delta.
    11. Commit: `feat(05-02): watchlist page + table + optimistic add/remove button for WATCH-01/WATCH-02`
  </action>
  <verify>
    <automated>cd /Users/milankatia/Desktop/personal/tracker && pnpm --filter web typecheck 2>&1 | tail -10 && pnpm --filter web test -- watchlist-mutations --run 2>&1 | tail -30 && pnpm --filter web lint 2>&1 | tail -10</automated>
    - 4/4 Vitest pass on watchlist-mutations
    - Typecheck clean
    - Lint clean
    - No `dangerouslySetInnerHTML` anywhere in the new files
  </verify>
  <done>
    - `/watchlist` renders the table without errors against the dev cluster.
    - Optimistic add/remove flicker is invisible to the user (item appears/disappears immediately).
    - Score badge color coding visually correct (eyeball check across at least one high-score / one mid / one low / one null fixture).
    - `AddToWatchlistButton` is importable from `@/components/watchlist/add-to-watchlist-button` — Phase 4 report pages will consume this when they ship.
    - Done note in SUMMARY: confirm the api proxy / base URL pattern used (it should match all other Phase 1+ api clients).
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → NestJS API (`/watchlist/*`) | Untrusted body, untrusted param, untrusted JWT (verified by JwtAuthGuard) |
| NestJS API → MongoDB (`watchlists` collection) | Trusted: `userId` filter ALWAYS derived from `req.user.sub` (JWT-verified) — never from client input |
| NestJS API → Redis (`score:latest:*`, `score:prev:*`, `watchlist:user:*`) | Trusted: keys are server-constructed; user input never interpolated into key names |

## STRIDE Threat Register

| Threat ID | Category               | Component                                    | Disposition | Mitigation Plan |
|-----------|------------------------|----------------------------------------------|-------------|-----------------|
| T-05-09   | Tampering / EoP        | POST /watchlist/items                        | mitigate    | `userId` derived from `req.user.sub` (JWT-validated). The DTO has NO `userId` field — `whitelist: true` strips any attempt to inject one. `class-validator` `@IsMongoId()` on `instrumentId` + `@IsIn(['STOCK','FUND'])` on `instrumentType`. |
| T-05-10   | Information Disclosure | GET /watchlist                               | mitigate    | `WatchlistModel.findOne({ userId: req.user.sub })` — query is hard-coded server-side. Integration test asserts user A cannot read user B's watchlist via any path (manipulated JWT / no JWT / forged header). |
| T-05-11   | DoS                    | POST /watchlist/items                        | mitigate    | Watchlist size capped at 200 (BadRequestException). Throttler per Phase 1 (60 req/min/IP) — add a stricter `@Throttle({ default: { limit: 30, ttl: 60_000 } })` on add/remove if Phase 1 throttler is decorator-configurable. |
| T-05-12   | DoS                    | GET /watchlist (Redis MGET fan-out)          | accept      | Watchlist capped at 200 items; MGET on 200 keys is microseconds. Server-side 5-min cache (Phase 1 CacheModule) reduces repeated fan-out. |
| T-05-13   | Tampering              | Redis key name construction                  | mitigate    | Keys are `score:latest:${instrumentId}` where `instrumentId` is read from the user's OWN watchlist document (server-side persisted). User cannot supply arbitrary key fragments via the API. |
| T-05-14   | Spoofing               | JwtAuthGuard bypass                          | mitigate    | All three routes wear `@UseGuards(JwtAuthGuard)`. Controller-test verifies 401 without JWT. |
| T-05-15   | Repudiation            | watchlist mutations                          | accept      | Standard request logs with `userId` + `instrumentId` + action (add/remove) suffice. No regulatory audit requirement for watchlist actions at v1. |
| T-05-16   | XSS                    | Frontend table rendering of `name` / `symbol`| mitigate    | All rendered as plain text via JSX interpolation. No `dangerouslySetInnerHTML`. Phase 2 ingestion should strip HTML at the source — defense-in-depth via React's default text-escape. |
| T-05-17   | Concurrent edit conflict | optimisticConcurrency VersionError         | mitigate    | Schema `optimisticConcurrency: true` surfaces conflict. Service retries once on `VersionError`; second failure surfaces as 409 to client. Tested explicitly (case 10 in Task 0). |
| T-05-18   | Information Disclosure | error responses                              | mitigate    | Nest's global exception filter masks stack traces (per Phase 1). DTO/validation errors surface as 400 with a sanitized `message`; service errors surface as 4xx/5xx with `message` only. No internal error details leak. |

</threat_model>

<verification>
Run after all 3 tasks land:

```bash
cd /Users/milankatia/Desktop/personal/tracker
# 1. Tests
pnpm --filter api test -- --testPathPattern=watchlist
pnpm --filter web test -- watchlist-mutations --run
# 2. Types & lint
pnpm --filter api typecheck && pnpm --filter web typecheck
pnpm --filter api lint && pnpm --filter web lint
# 3. End-to-end smoke against dev cluster
JWT=$DEV_JWT
IID=$(curl -sS -H "Authorization: Bearer $JWT" 'http://localhost:3001/search/instruments?q=REL' | jq -r '.[0].id')
curl -sS -X POST -H "Authorization: Bearer $JWT" -H "content-type: application/json" \
  -d "{\"instrumentId\":\"$IID\",\"instrumentType\":\"STOCK\"}" \
  http://localhost:3001/watchlist/items -w '%{http_code}\n'   # expect 204
curl -sS -H "Authorization: Bearer $JWT" http://localhost:3001/watchlist | jq '.items[0]'
# expect: { instrumentId, instrumentType, addedAt, latestScore, previousScore, delta }
curl -sS -X DELETE -H "Authorization: Bearer $JWT" http://localhost:3001/watchlist/items/$IID -w '%{http_code}\n'
# expect: 204
# 4. User isolation (negative test with a 2nd JWT)
JWT_B=$DEV_JWT_USER_B
curl -sS -H "Authorization: Bearer $JWT_B" http://localhost:3001/watchlist | jq '.items | length'
# expect: 0 (user B's watchlist is independent)
```

Frontend manual: log in → /watchlist → empty state with CTA → /search → find an instrument → on its report page (or via the AddToWatchlistButton hook), add it → return to /watchlist → row appears with score + delta arrow.
</verification>

<success_criteria>
- WATCH-01 ✅: User can add and remove stocks/funds from a personal watchlist via UI + API. Optimistic UI confirmed.
- WATCH-02 ✅: Watchlist items show a daily-refreshed score (from the Phase 3 EOD job's Redis writes) + a delta arrow vs the previous day.
- User isolation provably enforced (test + manual cross-user smoke).
- Watchlist size capped at 200; over-cap rejected with a clear error.
- No `$lookup` in the score-join path; Redis MGET is the primary read; Mongo ScoreHistory is the documented cold-Redis fallback.
- Cache `watchlist:user:{userId}` is busted on every mutation.
- All Phase 5 tests across BOTH plans pass: `pnpm -r test` clean.
- No regressions: `pnpm -r typecheck` + `pnpm -r lint` clean.
- Cross-phase contract verification: confirm Phase 3 writes BOTH `score:latest:*` and `score:prev:*` to Redis. If not, file a Phase 3 follow-up issue AND verify the Mongo fallback path is exercised.
</success_criteria>

<output>
After completion, create `.planning/phases/05-search-watchlist/05-02-SUMMARY.md` documenting:
- Final WatchlistService API + exact Redis key schema consumed
- Whether the cold-Redis Mongo fallback was reachable in practice (i.e., did Phase 3 write `score:prev:*`?)
- A 1-row sample response from GET /watchlist (with synthetic instrumentId)
- Optimistic-UI test recording / screenshot (manual)
- Open follow-ups (e.g., AddToWatchlistButton wiring into Phase 4 report pages — handoff to Phase 4 SUMMARY or a Phase 5.1)
- Decision log: per-user doc vs per-row collection (chose per-doc per A2), Redis vs $lookup (chose Redis per Pattern D)
</output>
