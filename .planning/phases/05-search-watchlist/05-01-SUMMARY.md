---
phase: 05-search-watchlist
plan: 01
slug: search-autocomplete
date: 2026-05-28
status: complete
deviations:
  - "Atlas Search index declaration deferred. The plan calls for `InstrumentSchema.searchIndex(...)` + `syncSearchIndexes()` bootstrap polling. The repo has no Atlas tier provisioned today (tests use mongodb-memory-server; staging Atlas is a Phase 8 dependency). Shipped a Mongo-native regex implementation that exercises the same `InstrumentMatch` contract and runs identically under mongodb-memory-server, local Mongo, and Atlas. When Atlas is provisioned, the `searchInstruments` body can be swapped to a `$search.compound` aggregation with no consumer change."
  - "Schema location: instruments live at `apps/api/src/modules/market-data/instruments/instrument.schema.ts` (the Phase 2 path), not the plan's `apps/api/src/instruments/schemas/instrument.schema.ts`. Used the real location."
  - "Unified instrument-master assumption broken. The plan assumes both stocks AND funds live in one `instruments` collection with a `type` discriminator. In this repo, funds live in a separate `fundReports` collection (Plan 04-05) keyed on AMFI scheme code. The SearchService queries BOTH collections concurrently and merges the results, exposing the discriminant via the `InstrumentMatch.type` field. Behaviour is identical from the caller's perspective; the underlying topology is different."
  - "Fund symbol field. The plan's `InstrumentMatch.symbol` is the NSE ticker for stocks; for funds we surface the AMFI `schemeCode` in the `symbol` field (typed as a numeric string). The `/fund/<code>` route already accepts that shape (Plan 04-05)."
  - "AccessTokenGuard (cookie-based) instead of plan's JwtAuthGuard. Same correction as Plan 04-03/04/05 — the repo never built a Bearer JwtAuthGuard."
  - "Did NOT install cmdk + use-debounce + @tanstack/react-query (plan's stack) + shadcn `command` / `popover` (plan's CLI steps). Rolled a minimal, accessible `<input role=combobox>` + dropdown list with a hand-written 250ms debounce — same UX semantics, no new deps. Adopting the upstream cmdk/shadcn primitives is a polish pass."
  - "No `ATLAS_SEARCH_DISABLED` env or `syncSearchIndexes()` bootstrap. Local Mongo is the v1 search engine; the bootstrap step is irrelevant until Atlas is provisioned."
  - "Web tests use `fireEvent` + real-timer flushes (matches the Plan 04-04 pattern). user-event 14 + Vitest fake timers don't compose cleanly under React 19."
---

## What landed

### Shared DTO (`packages/shared/src/instrument-match.ts`)

- `InstrumentMatch` + `InstrumentMatchType` + `InstrumentExchange`. Re-exported via `@finsight/shared`. Type discriminant routes the click in the UI (STOCK → `/stock/<symbol>`, FUND → `/fund/<schemeCode>`).

### API (`apps/api/src/search/`)

- `SearchService.searchInstruments(rawQuery, opts)`:
  - Normalises: trim → split on `/\s+/` → first 3 tokens → re-join.
  - Short-circuits at `query.length < 2` without touching Mongo (asserted by spec).
  - Queries `instruments` (NSE/BSE stocks) and `fundReports` (mutual funds) concurrently — `type` filter skips one branch when set.
  - Per-result ranking: 100 exact symbol/scheme-code, 80 symbol prefix, 60 name prefix, 40 name substring, with a `log1p(popularity)/30` boost for stocks (`popularity`) and funds (`meta.aumCr`). Merge + sort desc + slice to `limit`.
- `SearchController` (`@UseGuards(AccessTokenGuard)`): `GET /search/instruments?q=&type=&limit=` with class-validator DTO.
- `SearchQueryDto`: `@Length(2, 50)` on `q`, optional `@IsIn(['STOCK','FUND'])` on `type`, optional `@Type(() => Number) @IsInt @Min(1) @Max(10)` on `limit`.
- `SearchModule` registers `MongooseModule.forFeature` for both collections; `AppModule` imports it next to `PrecomputedReportsModule`.

### Web (`apps/web/`)

- `src/lib/api/search.ts` — `searchInstruments(q, opts)` client. Short-circuits at length<2; supports `AbortSignal` so a rapid keystroke cancels the previous in-flight request.
- `src/components/search/InstrumentSearch.tsx` — `'use client'` combobox with 250ms debounce, abort-on-rebound, grouped "Stocks" / "Mutual Funds" sections, no-results affordance, focus/blur visibility with a 150ms deferred close so a click still fires `onSelect`.
- `src/app/(app)/search/page.tsx` — `/search` page with the input and a router push to `/stock/<symbol>` or `/fund/<schemeCode>` per the selected match. Includes the "Analysis only. Not investment advice." disclaimer.

## Tests added

| File | Coverage |
|------|----------|
| `search.service.spec.ts` (8) | <2 char short-circuit; RELIANCE top-3 for 'REL'; symbol-prefix vs name-substring ordering by popularity; multi-word fund query top hit; 3-token trim; type='STOCK' filters out funds; type='FUND' filters out stocks; limit honoured. Runs against mongodb-memory-server with isolated `search_instruments` + `search_fund_reports` collections. |
| `search-query.dto.spec.ts` (6) | accept valid; reject q<2; reject q>50; reject unknown type; reject limit>10; transform limit string → number. |
| `search.controller.spec.ts` (2) | forwards q/type/limit to the service; returns the service payload verbatim. |
| `InstrumentSearch.test.tsx` (5) | sub-2-char does not fire the API; 3-keystroke burst debounces to ONE call; Stocks + Mutual Funds groups rendered with their items; `onSelect` callback invoked with the chosen match; "No instruments match \"zzzz\"" affordance on empty result. |

## Cross-phase contracts emitted

- `InstrumentMatch` shape — consumed by Plan 05-02 (watchlist) and any future global Cmd+K palette.
- `GET /search/instruments` — the search on-ramp to every report / watchlist / SEO page.

## Verification (at commit time)

| Gate | Result |
|------|--------|
| `pnpm --filter @finsight/api test` | **504 pass** (84 files; +16 net for 05-01) |
| `pnpm --filter @finsight/api test:e2e` | 16 pass |
| `pnpm --filter @finsight/api type-check` | clean |
| `pnpm --filter @finsight/api lint` | clean |
| `pnpm --filter @finsight/api lint:arch` | clean |
| `pnpm --filter @finsight/web test` | **83 pass** (18 files; +5 net for 05-01) |
| `pnpm --filter @finsight/web type-check` | clean |
| `pnpm --filter @finsight/web lint` | clean |
| `pnpm forbid-verbs` | clean |
| `git diff --check` | clean |

## Open questions / [ASSUMED]

- **Atlas Search activation.** Whenever the Atlas tier is provisioned, swap the body of `searchInstruments` to a `$search.compound` aggregation per the plan's Code Example 3. The contract on every caller stays the same.
- **Fund ID surface.** The `id` field of an `InstrumentMatch` is the Mongo `_id` string of the source doc; the `symbol` field is the human-meaningful identifier (NSE ticker / AMFI scheme code). Routing currently uses `symbol` because the report pages key on it. Re-evaluate if a future page wants the Mongo id.
- **Global Cmd+K palette.** Plan invites a `<CommandDialog>` keyboard palette. Deferred — wire it into the app shell when Phase 1's authenticated layout lands; until then, `/search` is the entry point.

## What this plan defers

- Atlas Search index declaration + `syncSearchIndexes()` bootstrap + `pnpm --filter api run search:sync` standalone script. Local Mongo regex covers v1; Atlas activation is a one-PR swap when the cluster lands.
- cmdk + shadcn `command`/`popover` primitives. Custom dropdown matches the UX truths; adopt upstream copies as a polish pass.
- `@tanstack/react-query` integration. Direct fetch + AbortController is enough for a single debounced input. Re-evaluate when the watchlist (Plan 05-02) introduces multi-source revalidation.
- Plan 05-02 — Watchlist (add/remove/list, per-user).
