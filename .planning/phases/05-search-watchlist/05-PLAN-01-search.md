---
phase: 05-search-watchlist
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/instruments/schemas/instrument.schema.ts
  - apps/api/src/instruments/instruments.bootstrap.ts
  - apps/api/src/search/search.module.ts
  - apps/api/src/search/search.controller.ts
  - apps/api/src/search/search.service.ts
  - apps/api/src/search/dto/search-query.dto.ts
  - apps/api/src/search/dto/instrument-match.dto.ts
  - apps/api/src/search/search.service.spec.ts
  - apps/api/test/fixtures/instruments.fixture.ts
  - apps/api/test/helpers/atlas-search-helper.ts
  - apps/api/scripts/search-sync.ts
  - apps/api/src/app.module.ts
  - apps/api/src/main.ts
  - packages/shared/src/search/instrument-match.ts
  - packages/shared/src/index.ts
  - apps/web/src/lib/api/search.ts
  - apps/web/src/components/search/instrument-search.tsx
  - apps/web/src/components/search/instrument-search.test.tsx
  - apps/web/src/components/ui/command.tsx
  - apps/web/src/components/ui/popover.tsx
  - apps/web/src/app/(authed)/search/page.tsx
  - apps/web/package.json
autonomous: true
requirements:
  - SRCH-01

must_haves:
  truths:
    - "A user can type a 2+ character query in the search palette and see ranked instrument suggestions within ~300ms (debounced)."
    - "Typing 'REL' surfaces RELIANCE.NS in the top 3 results (symbol-boost ranking works)."
    - "Typing 'axis bluechip' surfaces the matching mutual fund as the top hit."
    - "Stocks and funds are rendered in separate groups in the dropdown."
    - "Empty/short queries (< 2 chars) return [] without hitting Atlas."
    - "Queries longer than 3 tokens are server-trimmed before reaching Atlas."
    - "The Atlas Search index is declared in the Mongoose schema (version-controlled) and synced on app boot."
  artifacts:
    - path: "apps/api/src/instruments/schemas/instrument.schema.ts"
      provides: "Instrument schema with Schema.searchIndex() declaration (autocomplete on name + symbol, token on isin/type/exchange, number on popularity)"
      contains: "InstrumentSchema.searchIndex"
    - path: "apps/api/src/instruments/instruments.bootstrap.ts"
      provides: "syncSearchIndexes() — calls Model.createSearchIndexes() and polls $listSearchIndexes until status=READY"
      exports: ["syncSearchIndexes"]
    - path: "apps/api/src/search/search.service.ts"
      provides: "SearchService.searchInstruments(q, limit) — $search compound aggregation"
      min_lines: 60
    - path: "apps/api/src/search/search.controller.ts"
      provides: "GET /search/instruments?q=&type=&limit= — JwtAuthGuard + ThrottlerGuard"
      exports: ["SearchController"]
    - path: "apps/api/src/search/dto/search-query.dto.ts"
      provides: "SearchQueryDto with @IsString @MaxLength(50) @Length(2,50) on q, @IsOptional @IsIn(['STOCK','FUND']) on type, @IsInt @Min(1) @Max(10) on limit"
      contains: "class SearchQueryDto"
    - path: "apps/api/src/search/search.service.spec.ts"
      provides: "Integration tests for SRCH-01 — symbol-boost, fund top-hit, short-query short-circuit, token-cap trim"
      min_lines: 80
    - path: "apps/web/src/components/search/instrument-search.tsx"
      provides: "Client cmdk-based command palette with 250ms debounce, react-query, grouped stocks/funds rendering"
      min_lines: 50
    - path: "packages/shared/src/search/instrument-match.ts"
      provides: "Shared InstrumentMatch type consumed by both api and web"
      exports: ["InstrumentMatch"]
  key_links:
    - from: "apps/web/src/components/search/instrument-search.tsx"
      to: "GET /search/instruments"
      via: "@tanstack/react-query useQuery + use-debounce 250ms"
      pattern: "useQuery\\([^)]*queryKey:\\s*\\['search'"
    - from: "apps/api/src/search/search.controller.ts"
      to: "SearchService.searchInstruments"
      via: "Nest controller -> service (no DB code in controller)"
      pattern: "this\\.searchService\\.searchInstruments"
    - from: "apps/api/src/main.ts"
      to: "syncSearchIndexes()"
      via: "bootstrap call before app.listen()"
      pattern: "syncSearchIndexes\\("
    - from: "apps/api/src/search/search.service.ts"
      to: "InstrumentModel.aggregate"
      via: "$search.compound.should over name/symbol/isin with boosts 1.5/3/1.0"
      pattern: "\\$search"
---

<objective>
Deliver `SRCH-01`: a fast, ranked autocomplete over the combined stocks + funds instrument master, declared via Mongoose 9.6's native `Schema.searchIndex()` helper (no Atlas CLI / mongosh dependency), queried with a single `$search.compound` stage, and surfaced as a polished shadcn `Command` palette in Next.js 15.

Purpose: This is the on-ramp to the entire product. Every report / watchlist / SEO page is reached via search. The materialised instrument master from Phase 2 already exists — Phase 5 wires the Atlas Search index on top and adds the search service + UI.

Output: A working `/search/instruments` endpoint (JWT-guarded, rate-limited, DTO-validated) + a `<InstrumentSearch>` client component, ready for the watchlist plan and downstream report pages to consume.
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
@apps/api/src/app.module.ts
@apps/api/src/main.ts
@apps/web/src/components/ui

<decision_coverage_matrix>
| Req-ID  | Plan | Task         | Coverage | Notes                                                                                                  |
|---------|------|--------------|----------|--------------------------------------------------------------------------------------------------------|
| SRCH-01 | 01   | T0 + T1 + T2 | Full     | Schema search index (T1), service + controller + tests (T1), debounced cmdk UI w/ react-query (T2)     |
| WATCH-01| 02   | —            | Full     | Covered in Plan 02                                                                                     |
| WATCH-02| 02   | —            | Full     | Covered in Plan 02                                                                                     |

All 3 Phase 5 requirements have full coverage. No partial, no deferred, no "v1 simplified" reductions.
</decision_coverage_matrix>

<cross_phase_contracts>
This plan consumes contracts from prior phases. Honor exactly — do not silently work around:

1. Phase 2 instrument master (`instruments` collection, `Instrument` schema) — fields used: `name`, `symbol`, `isin`, `type` ('STOCK' | 'FUND'), `exchange`, `popularity`.
   - ASSUMPTION A1: `popularity` (market cap for stocks, AUM for funds) is populated by Phase 2.
   - GRACEFUL FALLBACK: query uses `path: { value: 'popularity', undefined: 0 }` — if absent, ranking degrades to relevance-only, not crash.
   - If grep of `apps/api/src/instruments/schemas/instrument.schema.ts` shows no `popularity` field: ADD it (`@Prop({ default: 0 }) popularity!: number;`) — minimal surgical patch, not a Phase 2 refactor.

2. Phase 1 infra — Atlas tier M10+ in `ap-south-1`, `JwtAuthGuard` from `apps/api/src/auth`, `ThrottlerGuard` registered globally, `ValidationPipe({ whitelist: true })` registered in `main.ts`.

3. `packages/shared` — shared TS types consumed by both web and API. Add `InstrumentMatch` here, NOT duplicated.
</cross_phase_contracts>

<interfaces>
<!-- Contracts the executor must implement against. No codebase exploration required. -->

```typescript
// packages/shared/src/search/instrument-match.ts
export type InstrumentType = 'STOCK' | 'FUND';
export type Exchange = 'NSE' | 'BSE' | 'AMFI';

export interface InstrumentMatch {
  id: string;
  symbol: string;
  name: string;
  type: InstrumentType;
  exchange?: Exchange;
  score: number; // Atlas search relevance score (NOT FinSight score)
}
```

```typescript
// apps/api/src/search/search.service.ts
export class SearchService {
  searchInstruments(
    rawQuery: string,
    opts?: { limit?: number; type?: 'STOCK' | 'FUND' },
  ): Promise<InstrumentMatch[]>;
}
```

```typescript
// apps/api/src/search/dto/search-query.dto.ts
export class SearchQueryDto {
  @IsString() @Length(2, 50) q!: string;
  @IsOptional() @IsIn(['STOCK', 'FUND']) type?: 'STOCK' | 'FUND';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) limit?: number;
}
```

```typescript
// apps/api/src/instruments/instruments.bootstrap.ts
export function syncSearchIndexes(timeoutMs?: number): Promise<void>;
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 0 (Wave 0): Test scaffolding + shared types + Atlas-search test helper</name>
  <files>
    apps/api/test/fixtures/instruments.fixture.ts,
    apps/api/test/helpers/atlas-search-helper.ts,
    apps/api/src/search/search.service.spec.ts,
    apps/api/src/search/dto/search-query.dto.spec.ts,
    apps/web/src/components/search/instrument-search.test.tsx,
    packages/shared/src/search/instrument-match.ts,
    packages/shared/src/index.ts
  </files>
  <behavior>
    Tests MUST FAIL first (RED) before any implementation lands. Each test file declares the SRCH-01 expectations described in 05-RESEARCH.md §Validation Architecture.

    `instruments.fixture.ts` — exports `SEARCH_FIXTURE: Instrument[]` with at least 50 seed instruments covering:
      - RELIANCE.NS (popularity ~ 17e12), TCS.NS, INFY.NS, HDFCBANK.NS, BHARATFORG.NS, HOUSING DEVELOPMENT FINANCE CORP (long name)
      - Axis Bluechip Fund (AMFI), SBI Bluechip Fund, HDFC Small Cap Fund
      - Two collision cases: a fund containing "TCS" in description, and a fund containing "REL" in name

    `atlas-search-helper.ts` — exports:
      - `waitForSearchIndexReady(model, indexName, timeoutMs=60_000)` — polls `$listSearchIndexes`
      - `seedAndIndex(model, docs)` — insertMany + wait

    `search.service.spec.ts` — integration tests against a real M0/M10 Atlas cluster (controlled by `process.env.ATLAS_TEST_URI`). If env unset, suite is `describe.skip(...)` with a console.warn — runs in dev/staging CI, not on offline laptop. Test cases (all currently RED):
      1. `searchInstruments('REL')` → RELIANCE.NS in top 3 results, score-sorted desc
      2. `searchInstruments('axis bluechip')` → "Axis Bluechip Fund" is result[0]
      3. `searchInstruments('')` and `searchInstruments('a')` → returns [] without aggregating (spy on `model.aggregate`)
      4. `searchInstruments('tata consultancy services ltd extra noise')` → `q` is trimmed to first 3 tokens server-side (spy or capture the pipeline)
      5. `searchInstruments('tcs', { type: 'STOCK' })` → no FUND docs in results

    `search-query.dto.spec.ts` — unit tests for class-validator:
      - q='' → invalid (Length min 2)
      - q='x'.repeat(51) → invalid (MaxLength 50)
      - type='ETF' → invalid (IsIn STOCK|FUND)
      - limit=11 → invalid (Max 10)
      - limit='3' (string from query-string) → transformed to 3 (Type Number)

    `instrument-search.test.tsx` (Vitest + RTL):
      1. Typing 2 chars triggers `searchInstruments` mock; typing 1 char does NOT
      2. 250ms debounce — three rapid keystrokes fire exactly one request after settle
      3. Stocks and funds appear in separate `CommandGroup` sections by heading text
      4. `shouldFilter={false}` on `<Command>` — verify by mocking 2 server results that would not match client filter

    `packages/shared/src/search/instrument-match.ts` — export `InstrumentMatch`, `InstrumentType`, `Exchange` per &lt;interfaces&gt; block. Re-export from `packages/shared/src/index.ts`.
  </behavior>
  <action>
    1. Create `packages/shared/src/search/instrument-match.ts` with the exact types from the &lt;interfaces&gt; block. Re-export from `packages/shared/src/index.ts` (add a line, don't replace).

    2. Create `apps/api/test/fixtures/instruments.fixture.ts` with 50+ realistic seed docs as described. Each doc MUST have `symbol`, `name`, `type`, and `popularity` (a sensible number — market cap in INR for stocks, AUM in INR for funds). Include the collision-case rows explicitly so the tests for symbol-boost have something to fail against.

    3. Create `apps/api/test/helpers/atlas-search-helper.ts` implementing the two helpers per 05-RESEARCH.md Code Example 2.

    4. Create `apps/api/src/search/search.service.spec.ts`. Top of file:
       ```ts
       const ATLAS_URI = process.env.ATLAS_TEST_URI;
       const describeIfAtlas = ATLAS_URI ? describe : describe.skip;
       ```
       Use `describeIfAtlas(...)` so local CI without Atlas skips cleanly with a warn line. Implement test cases 1–5 above. Tests MUST currently fail because `SearchService` does not exist.

    5. Create `apps/api/src/search/dto/search-query.dto.spec.ts` — pure unit tests using `validate(plainToInstance(...))`. No DB needed. Tests MUST currently fail because the DTO file doesn't exist yet.

    6. Create `apps/web/src/components/search/instrument-search.test.tsx` per behavior block. Mock the API client (`apps/web/src/lib/api/search`) with `vi.mock`. Tests MUST currently fail because the component doesn't exist.

    7. Run `pnpm --filter api test -- --testPathPattern=search` and `pnpm --filter web test -- instrument-search` — confirm RED (compile errors / undefined modules count as RED; commit anyway with `test(05-01): add failing tests for SRCH-01 service + DTO + UI`).
  </action>
  <verify>
    <automated>cd /Users/milankatia/Desktop/personal/tracker && pnpm --filter api test -- --testPathPattern="search\\.(service|dto)" --passWithNoTests=false 2>&1 | tail -40; pnpm --filter web test -- instrument-search.test --run 2>&1 | tail -20</automated>
    All test files exist, all tests fail (RED state). DTO unit tests fail with module-not-found. Service spec either fails or skips (skipped is acceptable on this laptop — Atlas URI absent).
  </verify>
  <done>
    - 7 new files created (2 shared, 5 test/fixture)
    - `pnpm --filter api typecheck` does NOT regress (existing code still compiles; new files may have unused imports that resolve once T1 lands)
    - `git status` shows the 7 new files staged; commit message `test(05-01): add failing tests for SRCH-01 service + DTO + UI`
    - Running tests now shows: search.service.spec → fails-or-skips (Atlas-gated), search-query.dto.spec → fails (no DTO), instrument-search.test.tsx → fails (no component). All three failure-or-skip states are expected.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 1 (GREEN): Instrument search index on Mongoose schema + NestJS SearchService/Controller + bootstrap wiring</name>
  <files>
    apps/api/src/instruments/schemas/instrument.schema.ts,
    apps/api/src/instruments/instruments.bootstrap.ts,
    apps/api/src/search/search.module.ts,
    apps/api/src/search/search.controller.ts,
    apps/api/src/search/search.service.ts,
    apps/api/src/search/dto/search-query.dto.ts,
    apps/api/src/search/dto/instrument-match.dto.ts,
    apps/api/scripts/search-sync.ts,
    apps/api/src/app.module.ts,
    apps/api/src/main.ts
  </files>
  <behavior>
    All Task 0 API-side tests turn GREEN. Specifically:
    - `search.service.spec.ts` cases 1-5 pass against an Atlas dev cluster (skipped locally is also "pass")
    - `search-query.dto.spec.ts` 5 cases all pass
    - `tsc --noEmit` clean on the api workspace

    Behavior contracts:
    - GET /search/instruments?q=&type=&limit= requires `JwtAuthGuard` (per V2 ASVS — inherits Phase 1 JWT) AND `ThrottlerGuard` (60 req/min default).
    - `q` is FIRST trimmed and split on `/\s+/`, capped to first 3 tokens, then re-joined — done inside `SearchService.searchInstruments` (NOT in the controller) so unit tests of the service alone catch regressions.
    - Pipeline EXACTLY follows 05-RESEARCH.md Example 3 — `should` clauses with boosts symbol:3, name:1.5 (fuzzy maxEdits 1, prefixLength 1, maxExpansions 50), isin:1.0; `minimumShouldMatch: 1`; popularity boost via `log1p(path:{value:'popularity', undefined:0})` multiplied with relevance.
    - Optional `type` filter is applied via an additional `compound.filter: [{ equals: { path: 'type', value: '<filter>' } }]` clause when present.
    - $project shape returns the `InstrumentMatch` shape (`id` as string via `$toString`, no `_id`, includes `score: $meta.searchScore`).
    - `index: 'instrument_autocomplete'` — must match the index name declared on the schema.

    Bootstrap contract:
    - `apps/api/src/instruments/instruments.bootstrap.ts` exports `syncSearchIndexes(timeoutMs = 60_000): Promise<void>` per Code Example 2.
    - `main.ts` calls `await syncSearchIndexes()` AFTER `await app.init()` and BEFORE `await app.listen()`.
    - Wrap in a try/catch — on `ATLAS_SEARCH_DISABLED=true` env (CI on M0 dev), log a WARN and continue (don't crash the process). This is the only acceptable conditional.
    - Standalone CLI script `apps/api/scripts/search-sync.ts` — boots a minimal Nest standalone app, runs `syncSearchIndexes`, exits 0/1. Wire `pnpm --filter api run search:sync` in `apps/api/package.json` scripts.
  </behavior>
  <action>
    1. Open `apps/api/src/instruments/schemas/instrument.schema.ts`. Verify the `Instrument` class has `symbol`, `name`, `isin?`, `type`, `exchange?`, `popularity` props. If `popularity` is missing, add: `@Prop({ default: 0 }) popularity!: number;` — DO NOT touch any other Phase 2 logic. Append the `InstrumentSchema.searchIndex({...})` block exactly per 05-RESEARCH.md Code Example 1 (index name `instrument_autocomplete`, mappings dynamic:false, edgeGram minGrams:2 maxGrams:15 foldDiacritics:true on name; same on symbol with foldDiacritics:false; token type on isin/type/exchange; number type on popularity; name and symbol additionally indexed as `string`/`token` for exact-match boost). DO NOT export the schema differently — keep existing export shape.

    2. Create `apps/api/src/instruments/instruments.bootstrap.ts` with `syncSearchIndexes` per Code Example 2. Inject `InstrumentModel` via `@InjectModel` if module-scoped, OR accept it as an arg (`syncSearchIndexes(model: Model<InstrumentDocument>)`). Match the import style already used by Phase 2 — read `instrument.schema.ts` first to see the InstrumentModel export pattern. The READY-poll loop runs `model.collection.aggregate([{ $listSearchIndexes: { name: 'instrument_autocomplete' } }]).toArray()`, checking `indexes[0]?.status === 'READY' && indexes[0]?.queryable === true`. Timeout default 60s, polled every 2s. Throw on timeout.

    3. Create `apps/api/scripts/search-sync.ts` — `NestFactory.createApplicationContext(AppModule)`, get `InstrumentModel` via `app.get(getModelToken(Instrument.name))`, call `syncSearchIndexes(model)`, `await app.close()`. Wrap in try/catch, `process.exit(1)` on error. Add npm script `"search:sync": "ts-node scripts/search-sync.ts"` to `apps/api/package.json`.

    4. Create `apps/api/src/search/dto/search-query.dto.ts`:
       ```ts
       import { Type } from 'class-transformer';
       import { IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
       export class SearchQueryDto {
         @IsString() @Length(2, 50) @MaxLength(50) q!: string;
         @IsOptional() @IsIn(['STOCK', 'FUND']) type?: 'STOCK' | 'FUND';
         @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) limit?: number = 10;
       }
       ```

    5. Create `apps/api/src/search/dto/instrument-match.dto.ts` — re-export the shared type:
       ```ts
       export { InstrumentMatch, InstrumentType, Exchange } from '@finsight/shared';
       ```
       (Or whatever package name the monorepo uses — confirm by reading `packages/shared/package.json`.)

    6. Create `apps/api/src/search/search.service.ts` per Code Example 3. Exact behavior:
       - Trim + split + slice(0, 3) + join the query — DO THIS FIRST.
       - If `query.length < 2`, return `[]` WITHOUT calling `model.aggregate` (the spy test depends on this).
       - Build the `$search` stage as a `const searchStage = { $search: { index: 'instrument_autocomplete', compound: { should: [...], minimumShouldMatch: 1, score: { function: {...} } } } }`.
       - If `opts.type` provided, also push `equals: { path: 'type', value: opts.type }` into a `compound.filter` array (keep `should` separate).
       - Pipeline: `[searchStage, { $limit: limit }, { $project: { _id: 0, id: { $toString: '$_id' }, symbol: 1, name: 1, type: 1, exchange: 1, score: { $meta: 'searchScore' } } }]`.

    7. Create `apps/api/src/search/search.controller.ts`:
       ```ts
       @Controller('search')
       @UseGuards(JwtAuthGuard, ThrottlerGuard)
       export class SearchController {
         constructor(private readonly searchService: SearchService) {}
         @Get('instruments')
         search(@Query() dto: SearchQueryDto) {
           return this.searchService.searchInstruments(dto.q, { type: dto.type, limit: dto.limit });
         }
       }
       ```
       Confirm the project's JwtAuthGuard import path by reading `apps/api/src/auth` — use whatever pattern stock/fund controllers use (likely `@nestjs/passport`'s `AuthGuard('jwt')`).

    8. Create `apps/api/src/search/search.module.ts` — imports `MongooseModule.forFeature([{ name: Instrument.name, schema: InstrumentSchema }])`, provides `SearchService`, controllers `[SearchController]`, exports `SearchService`. Register in `app.module.ts` imports array.

    9. Edit `apps/api/src/main.ts` — after `await app.init();` (or after the global pipes are registered, before `await app.listen(...)`), add:
       ```ts
       try {
         if (process.env.ATLAS_SEARCH_DISABLED !== 'true') {
           const model = app.get(getModelToken(Instrument.name));
           await syncSearchIndexes(model);
         } else {
           Logger.warn('ATLAS_SEARCH_DISABLED=true — skipping search index sync', 'Bootstrap');
         }
       } catch (err) {
         Logger.error('Search index sync failed', err, 'Bootstrap');
         throw err; // hard fail in prod; CI can set ATLAS_SEARCH_DISABLED
       }
       ```

    10. Run `pnpm --filter api typecheck` then `pnpm --filter api test -- --testPathPattern="search\\.(service|dto)"`. DTO tests MUST be GREEN unconditionally. Service spec is GREEN if `ATLAS_TEST_URI` env is set, else SKIPPED.

    11. Commit: `feat(05-01): atlas search index + SearchService + autocomplete API for SRCH-01`
  </action>
  <verify>
    <automated>cd /Users/milankatia/Desktop/personal/tracker && pnpm --filter api typecheck 2>&1 | tail -20 && pnpm --filter api test -- --testPathPattern="search\\.(service|dto)" 2>&1 | tail -30</automated>
    - DTO spec: 5/5 pass
    - Service spec: 5/5 pass (with `ATLAS_TEST_URI`) or skipped cleanly without
    - `typecheck`: zero errors in `apps/api`
    - `grep -n "instrument_autocomplete" apps/api/src` returns hits in BOTH `instrument.schema.ts` (declaration) AND `search.service.ts` (query `index: 'instrument_autocomplete'`)
  </verify>
  <done>
    - GET /search/instruments?q=REL responds with JSON `{ items: [...] }` (or top-level array — pick one and stick with it; doc in InstrumentMatch.dto). Manual sanity check via curl:
      ```
      JWT=$(./scripts/dev-jwt.sh) # or whatever Phase 1 helper exists
      curl -s "http://localhost:3001/search/instruments?q=REL" -H "Authorization: Bearer $JWT" | jq '.[0]'
      ```
      Returns RELIANCE.NS-shaped result.
    - `pnpm --filter api run search:sync` exits 0 against the Atlas dev cluster.
    - All cross-phase contracts honored: no rewriting of Phase 2 schema beyond adding `popularity` if absent; no changes to ScoreHistory; no new env vars beyond optional `ATLAS_SEARCH_DISABLED` and `ATLAS_TEST_URI`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (GREEN): Next.js InstrumentSearch component + react-query client + /search page shell</name>
  <files>
    apps/web/package.json,
    apps/web/src/components/ui/command.tsx,
    apps/web/src/components/ui/popover.tsx,
    apps/web/src/lib/api/search.ts,
    apps/web/src/components/search/instrument-search.tsx,
    apps/web/src/app/(authed)/search/page.tsx
  </files>
  <behavior>
    All Task 0 web-side tests turn GREEN.
    - `instrument-search.test.tsx` all 4 cases pass
    - User-visible UX (per shadcn/Tailwind v4 design conventions in this monorepo):
      - Cmd+K (or Ctrl+K) opens the palette; ESC closes it.
      - Input has placeholder "Search stocks or funds…" and the shadcn `Command` keyboard nav (↑ ↓ Enter) works.
      - While loading (debounced fetch in flight), a subtle "Searching…" affordance appears in the empty state — NOT a flashing skeleton.
      - Empty results show "No instruments match \"{query}\"" using `CommandEmpty`.
      - Stock rows: monospace `symbol` + muted-foreground `name`. Fund rows: `name` only (funds don't have ticker-style symbols).
      - Selecting a row calls the `onSelect` prop with the `InstrumentMatch`. The `/search` page navigates to `/stock/[symbol]` or `/fund/[id]` accordingly (use `useRouter().push`).
    - `shouldFilter={false}` on `<Command>` so server is the single source of truth for ranking.
    - `staleTime: 30_000` on the react-query so re-typing the same prefix doesn't refetch.
  </behavior>
  <action>
    1. Add deps in `apps/web/package.json`:
       ```
       cmdk@^1.1.1
       use-debounce@^10.1.1
       @tanstack/react-query@^5.100.14
       ```
       Then `pnpm install`. Confirm `@tanstack/react-query` provider is already in `apps/web/src/app/providers.tsx` — if not, add a `QueryClientProvider` wrapper there (single QueryClient per app). Phase 1 should have set this up; check first.

    2. Install shadcn components:
       ```
       pnpm --filter web dlx shadcn@latest add command popover
       ```
       This writes `apps/web/src/components/ui/command.tsx` and `popover.tsx`. Verify the files were created and import paths use the monorepo's existing `@/components/ui/*` alias convention.

    3. Create `apps/web/src/lib/api/search.ts`:
       ```ts
       import type { InstrumentMatch } from '@finsight/shared'; // confirm package name from packages/shared/package.json
       export async function searchInstruments(q: string, type?: 'STOCK' | 'FUND'): Promise<InstrumentMatch[]> {
         if (q.length < 2) return [];
         const params = new URLSearchParams({ q });
         if (type) params.set('type', type);
         const res = await fetch(`/api/search/instruments?${params}`, {
           credentials: 'include',
         });
         if (!res.ok) throw new Error(`Search failed: ${res.status}`);
         return res.json();
         // NOTE: confirm whether the api proxy in next.config.ts rewrites /api/* → http://api:3001
         // If a different pattern is used (e.g. NEXT_PUBLIC_API_URL), match the existing api-client pattern.
       }
       ```
       BEFORE writing this, grep `apps/web/src/lib` for existing api-client patterns and match them exactly. DO NOT invent a new fetching convention.

    4. Create `apps/web/src/components/search/instrument-search.tsx` per 05-RESEARCH.md Code Example 5 with these additions/precision points:
       - `'use client'` at the top.
       - `shouldFilter={false}` on `<Command>`.
       - `<CommandInput value={q} onValueChange={setQ} />` — controlled.
       - When `isFetching && debounced.length >= 2 && data.length === 0`, render a tiny "Searching…" inside `CommandEmpty` (or as a sibling, depending on cmdk version semantics — pick the one that doesn't double-render).
       - Render `<CommandGroup heading="Stocks">` first, then `<CommandGroup heading="Mutual Funds">`. Hide a group entirely if it has zero items.
       - Each `<CommandItem value={s.id} onSelect={() => onSelect(s)}>`.
       - Stocks: `<span className="font-mono text-sm">{s.symbol}</span><span className="ml-2 text-muted-foreground">{s.name}</span>`
       - Funds: `<span>{f.name}</span>`
       - Export `<InstrumentSearch onSelect={...}>` AND a default `<GlobalSearchPalette>` that wraps in `<CommandDialog>` for Cmd+K usage (optional in v1 — implement if shadcn `command` shipped `CommandDialog`, else expose as a follow-up).

    5. Create `apps/web/src/app/(authed)/search/page.tsx`:
       ```tsx
       'use client';
       import { useRouter } from 'next/navigation';
       import { InstrumentSearch } from '@/components/search/instrument-search';
       export default function SearchPage() {
         const router = useRouter();
         return (
           <main className="mx-auto max-w-2xl py-8 px-4">
             <h1 className="text-2xl font-semibold mb-4">Search</h1>
             <InstrumentSearch
               onSelect={(m) => {
                 const target = m.type === 'STOCK' ? `/stock/${m.symbol}` : `/fund/${m.id}`;
                 router.push(target);
               }}
             />
             <p className="text-xs text-muted-foreground mt-4">
               Analysis only. Not investment advice.
             </p>
           </main>
         );
       }
       ```
       This page is a placeholder until the global Cmd+K palette is wired into the layout — but it's enough to manually QA SRCH-01.

    6. Run `pnpm --filter web test -- instrument-search.test --run` — all 4 cases MUST be GREEN.
    7. Run `pnpm --filter web typecheck` — clean.
    8. Run `pnpm --filter web lint` — clean (no warnings on the new files).
    9. Commit: `feat(05-01): cmdk-based InstrumentSearch component + /search page for SRCH-01`
  </action>
  <verify>
    <automated>cd /Users/milankatia/Desktop/personal/tracker && pnpm --filter web typecheck 2>&1 | tail -20 && pnpm --filter web test -- instrument-search.test --run 2>&1 | tail -30 && pnpm --filter web lint 2>&1 | tail -10</automated>
    - Vitest: 4/4 pass on instrument-search
    - Typecheck: clean
    - Lint: clean on new files
    - Manual smoke (recorded in done): visit /search while logged in, type "REL" — RELIANCE.NS appears as the top stock; clicking it navigates to /stock/RELIANCE.NS (404 expected — Phase 4 hasn't shipped to dev yet, but the route push fires).
  </verify>
  <done>
    - `<InstrumentSearch>` keyboard-navigable, debounced, grouped, no console errors / warnings.
    - Selection wires to `useRouter().push` for both STOCK and FUND types.
    - `pnpm install` shows cmdk, use-debounce, @tanstack/react-query in lockfile.
    - No `dangerouslySetInnerHTML`, no `v-html` (N/A — Vue not in stack). Plain-text rendering throughout.
    - Compliance disclaimer "Analysis only. Not investment advice." visible on the page.
    - Done note: capture a 5s screen recording / screenshot of the palette working against the dev cluster and attach to the SUMMARY. (Manual verification only; not blocking.)
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → NestJS API (`/search/instruments`) | Untrusted query string, untrusted JWT (verified by JwtAuthGuard) |
| NestJS API → MongoDB Atlas (`$search` aggregation) | Trusted: user input passed only as the `query` string argument of `autocomplete`/`text` operators, never interpolated into pipeline structure |
| App boot → Atlas Admin API (`createSearchIndexes`) | Trusted: control-plane call with the Atlas service credential — no user input involved |

## STRIDE Threat Register

| Threat ID    | Category               | Component                                | Disposition | Mitigation Plan |
|--------------|------------------------|------------------------------------------|-------------|-----------------|
| T-05-01      | Tampering              | SearchController `/search/instruments` `q` param | mitigate    | `class-validator` `@IsString @Length(2, 50)` on `q`; type-narrowed to STOCK\|FUND via `@IsIn`; `ValidationPipe({ whitelist: true })` strips unknown fields. `q` is passed only as a string-typed argument to the `autocomplete` operator — never spliced into pipeline structure. Cap to first 3 tokens server-side before query. |
| T-05-02      | Denial of Service      | SearchController                         | mitigate    | `@nestjs/throttler` global guard (default 60 req/min/IP from Phase 1). `q` length capped at 50 chars + 3 tokens — bounds Atlas work. Result `limit` capped at 10 in DTO. |
| T-05-03      | Information Disclosure | SearchController + InstrumentModel       | accept (residual) | Instrument master is intentionally public-domain market data (NSE/BSE/AMFI). Search results are auth-gated only to prevent unauthenticated scraping. Rate limit + max 10 results limit scraping ROI. No PII leakage possible — schema has no user data. |
| T-05-04      | Information Disclosure | bootstrap `syncSearchIndexes` error logs | mitigate    | Wrap in try/catch; log only `err.name` + `err.message` via `Logger.error` — no full Atlas connection string. Hard-fail process so prod doesn't run with a half-built index. |
| T-05-05      | Elevation of Privilege | SearchController                         | mitigate    | `JwtAuthGuard` applied at controller level. No code path serves search without a valid JWT (inherits Phase 1 V2/V3 auth controls). |
| T-05-06      | Spoofing               | Atlas Search index creation                | mitigate    | Atlas Admin API credentials live in secret manager (Phase 1 FOUND-04). Bootstrap only runs from server context, never client. |
| T-05-07      | Tampering / XSS        | Frontend rendering of search results     | mitigate    | All `<CommandItem>` rendering is plain text via JSX interpolation — no `dangerouslySetInnerHTML`. Defense-in-depth: Phase 2 ingestion should strip HTML; verify by adding an `<` character in a fixture name and confirming it renders literally. |
| T-05-08      | Repudiation            | Search queries (audit / compliance)       | accept      | Search queries are not security-sensitive actions; no audit log required at v1. Trace IDs in standard request logs are sufficient. Re-evaluate if regulatory guidance changes. |

</threat_model>

<verification>
Run after all 3 tasks land:

```bash
cd /Users/milankatia/Desktop/personal/tracker
# 1. Tests
pnpm --filter api test -- --testPathPattern="search\\.(service|dto)"
pnpm --filter web test -- instrument-search.test --run
# 2. Types
pnpm --filter api typecheck && pnpm --filter web typecheck
# 3. Index sync (against dev Atlas cluster)
pnpm --filter api run search:sync
# 4. Smoke
curl -sS -H "Authorization: Bearer $DEV_JWT" "http://localhost:3001/search/instruments?q=REL" | jq '.[0:3]'
# Expect: RELIANCE.NS in position 0 or 1
```

Frontend manual: log in → visit `/search` → type "axis" → "Axis Bluechip Fund" appears in the Mutual Funds group within ~300ms.
</verification>

<success_criteria>
- SRCH-01 ✅: User can search stocks and funds with autocomplete (name + symbol) backed by Atlas Search. Symbol-boost ranking places obvious hits at the top. Fund hits group separately from stocks. Sub-300ms perceived latency (250ms debounce + Atlas response).
- Index declaration is in version control next to the schema (no Atlas CLI / mongosh dependency).
- Atlas index reaches `READY` status on boot before the app reports healthy (bootstrap throws if it doesn't within 60s).
- All Task 0 tests transition RED → GREEN through Tasks 1 and 2.
- No regression: `pnpm -r typecheck` and `pnpm -r lint` clean on the whole monorepo.
- No new env vars except optional `ATLAS_SEARCH_DISABLED` (CI) and `ATLAS_TEST_URI` (integration test gating).
- Cross-phase contracts honored: Phase 2 `popularity` field gracefully handled (used if present, no-op if absent — never crashes).
</success_criteria>

<output>
After completion, create `.planning/phases/05-search-watchlist/05-01-SUMMARY.md` documenting:
- Atlas index name and the exact JSON definition synced
- Concrete sample queries + observed top-3 results from the dev cluster
- Any cross-phase contract patches applied (e.g., added `popularity` to Phase 2 schema)
- Open follow-ups (e.g., global Cmd+K palette wiring into root layout — recommended for Phase 5.1 or Phase 4 polish)
- Decision log: ranking-boost values chosen and the rationale
</output>
