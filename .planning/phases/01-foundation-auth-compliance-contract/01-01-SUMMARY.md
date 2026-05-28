---
phase: 01-foundation-auth-compliance-contract
plan: 01
subsystem: infra
tags: [turborepo, pnpm-workspaces, nextjs, nestjs, tailwind-v4, shadcn-ready, zod, tsup, vitest, mongodb-memory-server, ioredis-mock]

requires: []

provides:
  - "Turborepo monorepo (apps/web, apps/api, packages/shared) wired with workspace protocol"
  - "@finsight/shared package exporting ApiError discriminated union + isApiError guard + SHARED_SENTINEL, dual ESM/CJS via tsup"
  - "apps/web — Next.js 15.5 + React 19.2 + Tailwind v4 (CSS-first @theme, no tailwind.config.js) + typed api-client"
  - "apps/api — NestJS 11.1 baseline with /ping endpoint round-tripping the shared sentinel"
  - "Wave-0 test infrastructure: vitest configs x3, mongodb-memory-server replica set, ioredis-mock, passport-google-oauth20 mock, user seed factory, .env.test"
  - "docker-compose.yml — local Mongo 7 single-node replica set + Redis 7 for transactions + time-series"
  - ".env.example enumerating every var the Plan 02 Zod env schema will validate"
  - "Path alias @finsight/shared resolving in both apps' tsconfigs + at runtime via pnpm workspace symlink"

affects:
  - "01-02 (env Zod schema + Terminus health + CacheService) — consumes Wave-0 test infra + .env.example + workspace shape"
  - "01-03 (auth: signup/login/refresh/Google/logout/DPDP consent) — consumes mongodb-memory-server + Google OAuth mock + user factory"
  - "01-04 (Verdict branded type + forbid-verbs CI guard) — consumes packages/shared barrel export"
  - "All later phases — inherit monorepo layout, shared package contract, test harness"

tech-stack:
  added:
    - "turbo@2.9.15"
    - "pnpm@10.28.2 (workspace protocol)"
    - "typescript@5.9.3"
    - "next@15.5.4 + react@19.2.0 + react-dom@19.2.0"
    - "tailwindcss@4.3.0 + @tailwindcss/postcss@4.3.0 (CSS-first, no JS config)"
    - "@nestjs/{core,common,platform-express}@11.1.24 + @nestjs/cli@11.0.21 + @nestjs/testing@11.1.24 + @nestjs/schematics@11.1.0"
    - "reflect-metadata@0.2.2 + rxjs@7.8.2"
    - "zod@4.4.3"
    - "tsup@8.5.1 (dual ESM+CJS+dts build for packages/shared)"
    - "vitest@3.2.4 + @vitejs/plugin-react@4.7.0 + @vitest/coverage-v8@3.2.4 + jsdom@25.0.1 + @testing-library/react@16.3.2 + expect-type@1.3.0"
    - "unplugin-swc@1.5.9 + @swc/core@1.15.40 (decorator-metadata transform for Nest in Vitest)"
    - "mongodb-memory-server@10.4.3 (Mongo 7.0.24 replica-set binary, ~66MB, cached)"
    - "ioredis@5.11.0 + ioredis-mock@8.13.1"
    - "mongoose@9.6.3 (devDep for Wave-0 smoke; promoted to dep in Plan 02 via @nestjs/mongoose)"
    - "passport-google-oauth20@2.0.0 + @types/passport-google-oauth20@2.0.17"
    - "supertest@7.2.2 + @types/supertest@6.0.3 + @types/express@5.0.6"
  patterns:
    - "Workspace-protocol intra-monorepo refs (workspace:*) — packages/shared symlinked into apps/* node_modules so Node resolution finds dist/index.cjs through exports map"
    - "tsup dual ESM+CJS+dts for @finsight/shared so the CJS-built Nest app can require() while the ESM Next.js app imports the same source"
    - "Two-tsconfig pattern in apps/api — tsconfig.json (no rootDir, source path alias for IDE + Vitest) vs tsconfig.build.json (rootDir:src, no path alias, incremental:false so nest build's deleteOutDir doesn't strand stale buildinfo)"
    - "Vitest + unplugin-swc for NestJS tests — emits legacy decorator metadata so Nest DI works without ts-jest"
    - "Wave-0 lazy I/O — ensureMongo()/ensureRedis() only spin up infra when a spec asks for it; pure unit specs pay zero overhead"
    - "shared package excludes dist/*.{js,cjs,mjs} from Vitest collection so built outputs never get re-loaded as tests"

key-files:
  created:
    - "turbo.json"
    - "pnpm-workspace.yaml"
    - "package.json"
    - ".npmrc"
    - "tsconfig.base.json"
    - ".gitignore"
    - ".env.example"
    - "docker-compose.yml"
    - "apps/web/package.json"
    - "apps/web/tsconfig.json"
    - "apps/web/next.config.ts"
    - "apps/web/postcss.config.mjs"
    - "apps/web/vitest.config.ts"
    - "apps/web/next-env.d.ts (auto)"
    - "apps/web/src/app/layout.tsx"
    - "apps/web/src/app/page.tsx"
    - "apps/web/src/app/globals.css"
    - "apps/web/src/lib/api-client.ts"
    - "apps/api/package.json"
    - "apps/api/tsconfig.json"
    - "apps/api/tsconfig.build.json"
    - "apps/api/nest-cli.json"
    - "apps/api/vitest.config.ts"
    - "apps/api/.env.test"
    - "apps/api/src/main.ts"
    - "apps/api/src/app.module.ts"
    - "apps/api/src/app.controller.ts"
    - "apps/api/src/app.controller.spec.ts"
    - "apps/api/test/setup.ts"
    - "apps/api/test/google-oauth.mock.ts"
    - "apps/api/test/factories/user.factory.ts"
    - "apps/api/test/types/ioredis-mock.d.ts"
    - "apps/api/test/wave0-infra.spec.ts"
    - "packages/shared/package.json"
    - "packages/shared/tsconfig.json"
    - "packages/shared/tsup.config.ts"
    - "packages/shared/vitest.config.ts"
    - "packages/shared/src/index.ts"
    - "packages/shared/src/api-errors.ts"
    - "packages/shared/test/setup.ts"
    - "packages/shared/test/api-errors.spec.ts"
    - "packages/shared/test/api-errors.test-d.ts"
  modified: []

key-decisions:
  - "Adopted .npmrc + pnpm.onlyBuiltDependencies allowlist (@nestjs/core, @swc/core, esbuild, mongodb-memory-server, sharp, unrs-resolver) so pnpm 10's default script-blocking doesn't strand the toolchain"
  - "Used two tsconfigs in apps/api: tsconfig.json (no rootDir, path alias to shared source) for type-check/Vitest, tsconfig.build.json (rootDir:src, no alias, incremental:false) for nest build — alias to shared source was leaking emitted .js into packages/shared/src; runtime resolution happens via the pnpm workspace symlink + exports map"
  - "Wave-0 test infra is lazy (ensureMongo/ensureRedis on demand) instead of starting Mongo on every spec — pure unit tests don't pay the ~100MB binary-download or 2s replica-set startup cost"
  - "ioredis-mock is sufficient for Phase 1 cache primitives; will introduce a real Redis testcontainer when BullMQ (Phase 3) needs Lua scripting"
  - "Used Next.js 15.5.4 (latest 15.5.x patch) rather than hand-pinning — npm registry resolved within the locked 15.5.x line"

patterns-established:
  - "Monorepo layout: apps/* + packages/* under Turborepo with pnpm workspaces; shared types via @finsight/shared"
  - "Per-task atomic commits with conventional message bodies (chore/feat/test/refactor scoped to 01-01)"
  - "Path alias @finsight/shared resolves to source in IDE/type-check/Vitest, to built dist at runtime — single import string, two resolution targets"
  - "Wave-0 lazy infra pattern — every later test spec can ensureMongo() / ensureRedis() without polluting unrelated specs"

requirements-completed:
  - FOUND-01
  - FOUND-03

duration: 23min
completed: 2026-05-28
---

# Phase 1 Plan 01: Monorepo Scaffold + Shared Package + Wave-0 Test Infra Summary

**Turborepo monorepo (Next.js 15.5 + NestJS 11.1 + packages/shared via tsup) with a typed @finsight/shared round-trip and a lazy mongodb-memory-server + ioredis-mock + passport-google-oauth20 Wave-0 test harness — `pnpm turbo run type-check build test` is fully green.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-28T11:13:00Z
- **Completed:** 2026-05-28T11:38:00Z
- **Tasks:** 3 of 3
- **Files created:** 42
- **Files modified:** 0
- **Lines of code (new):** ~1,400

## Accomplishments

- Workspace tree wired: `apps/web`, `apps/api`, `packages/shared` under Turborepo + pnpm.
- `@finsight/shared` builds via tsup to ESM+CJS+dts, exports the `ApiError` discriminated union + `isApiError` guard + `SHARED_SENTINEL`, and is consumed by both apps (`apps/web/src/app/page.tsx` and `apps/api/src/app.controller.ts`) with the same import string.
- `pnpm turbo run type-check build test` — 11 unique tasks green; 14 tests passing (7 shared unit + 7 api: 1 controller spec + 6 Wave-0 infra smoke covering Mongo replica-set connect + read/write, Redis-mock SET/GET/EXPIRE/DEL/PING, OAuth mock surface, user factory uniqueness).
- Wave-0 test infra is reachable from any future api spec without re-deriving fixtures.
- Tailwind v4 CSS-first wired correctly — no `tailwind.config.js` artifact, theme tokens live in `src/app/globals.css` under `@theme`.
- Docker Compose ships a single-node Mongo 7 replica set (required for Plan 03 multi-doc txns + downstream time-series collections) + Redis 7.
- `.env.example` enumerates every variable Plan 02's Zod env schema will validate.

## Task Commits

1. **Task 1: Monorepo skeleton (Turborepo + pnpm workspaces + Docker Compose)** — `453a307` (chore)
2. **Task 2: Scaffold apps/web + apps/api + packages/shared with shared-type round-trip** — `ae7d679` (feat)
3. **Task 3: Wave-0 test infrastructure (mongodb-memory-server + ioredis-mock + Google OAuth mock)** — `bcc335f` (chore)
4. **Plan metadata commit** — `c0acdfb` (docs: SUMMARY + STATE + ROADMAP + REQUIREMENTS)
5. **Flat ESLint config + web lint script swap** (Rule 3 — Blocking) — `fccda67` (chore)

## Verification Output

```text
$ pnpm turbo run lint type-check test build
 Tasks:    12 successful, 12 total
Cached:    4 cached, 12 total
  Time:    13.314s
  // lint:       4/4 (shared, api, web, root)
  // type-check: 4/4
  // test:       4/4  (7 shared + 7 api + web passWithNoTests)
  // build:      3/3  + shared dist + apps/api dist + apps/web/.next present
```

Per-task breakdown:
- `@finsight/shared:test` — 7 tests (isApiError guard: validation, all-kinds, missing-kind, unknown-kind, non-string-message, null/primitives, arrays).
- `@finsight/api:test` — 7 tests (1 app.controller.spec returning the shared sentinel + 6 wave0-infra.spec proving mongoose connects to MongoMemoryReplSet, can insert/read, ioredis-mock SET/GET/EXPIRE/DEL/PING, Google OAuth mock surface, user factory uniqueness).
- `@finsight/web:test` — passWithNoTests (specs land Plan 03 + Phase 9).

Locked package versions confirmed via `pnpm list --depth=0 -r`:
- `next@15.5.4`, `react@19.2.0`, `tailwindcss@4.3.0`
- `@nestjs/{core,common,platform-express}@11.1.24`, `@nestjs/cli@11.0.21`
- `zod@4.4.3`, `tsup@8.5.1`, `vitest@3.2.4`
- `mongodb-memory-server@10.4.3` (Mongo binary 7.0.24), `ioredis-mock@8.13.1`, `passport-google-oauth20@2.0.0`

## Decisions Made

1. **`.npmrc` + `pnpm.onlyBuiltDependencies` allowlist.** pnpm 10 blocks all post-install scripts by default. Without explicit approval for `@swc/core`, `esbuild`, `mongodb-memory-server` (binary download), `@nestjs/core`, and `sharp`, the toolchain wouldn't be runnable. Allowlisted in root `package.json`'s `pnpm.onlyBuiltDependencies`.
2. **Two-tsconfig pattern in `apps/api`.** A single tsconfig with `rootDir: src` + path alias to `packages/shared/src/index.ts` made `tsc -p tsconfig.build.json` emit the shared sources into `packages/shared/src/*.js` (which then broke `vitest` because the package is `"type": "module"` and those emitted files were CJS-shaped). Fix: split into `tsconfig.json` (no rootDir, alias to source — for IDE/type-check/Vitest DX) and `tsconfig.build.json` (rootDir:src, **no path alias**, `incremental: false`). Runtime resolution falls through to the pnpm workspace symlink → `packages/shared/package.json` exports → built dist.
3. **`incremental: false` in `tsconfig.build.json`.** `nest build` uses `deleteOutDir: true`; the inherited `incremental: true` left `tsconfig.build.tsbuildinfo` at the project root, so the next build saw "nothing changed" but `dist` was gone — silently emitted nothing. Disabling incremental in the build config fixed it; type-check still benefits from incremental.
4. **Lazy Wave-0 infra (`ensureMongo()` / `ensureRedis()`).** Don't start Mongo in `beforeAll` of every spec — pure unit tests don't need it. Specs that do call the lazy starter; the global teardown stops anything that was started.
5. **`apps/api/test/types/ioredis-mock.d.ts` ambient module.** Upstream ships no types; declaring it as `typeof Redis` keeps type-check clean without a sketchy `// @ts-ignore`.
6. **Picked Next.js 15.5.4 / Tailwind 4.3.0 / Nest 11.1.24 from npm's current `^11.1.0` / `15.5.x` / `4.3.0` resolution** — these are the latest patches inside the locked majors at install time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added `unplugin-swc` + `@swc/core` install + `apps/api/vitest.config.ts` to Task 2**
- **Found during:** Task 2 (was planned for Task 3)
- **Issue:** Task 2's verify runs `pnpm --filter @finsight/api test`, which loads `apps/api/src/app.controller.spec.ts`. Without SWC's decorator-metadata transform, Vitest's default esbuild loader drops `emitDecoratorMetadata`, and `@Controller`/`@Module` Nest DI fails at test time. Task 3 was the original home of the SWC config, but Task 2 wouldn't verify without it.
- **Fix:** Moved `unplugin-swc`, `@swc/core`, `apps/api/vitest.config.ts` (with legacy-decorator + decoratorMetadata SWC settings), and the placeholder `apps/api/test/setup.ts` into Task 2. Task 3 then expanded `test/setup.ts` with real `ensureMongo()` / `ensureRedis()` lazy starters.
- **Files modified:** `apps/api/package.json` (devDeps), `apps/api/vitest.config.ts` (new), `apps/api/test/setup.ts` (new placeholder).
- **Verification:** `pnpm --filter @finsight/api test` green during Task 2 (1 test passed).
- **Committed in:** `ae7d679` (Task 2 commit).

**2. [Rule 1 — Bug] Stale `.js`/`.js.map` emitted into `packages/shared/src/` by `nest build`**
- **Found during:** Task 3 (`pnpm turbo run test` second run).
- **Issue:** With `apps/api/tsconfig.build.json` using `paths: { "@finsight/shared": [".../packages/shared/src/index.ts"] }` + `rootDir: ./src`, `tsc` was resolving the shared package via the path alias (source) but the rootDir constraint allowed emit anyway — emitted compiled `.js` files into `packages/shared/src/`. The shared package's `"type": "module"` then made vitest treat those `.js` files as ESM, but their CJS-shaped `exports.foo = ...` content tripped `ReferenceError: exports is not defined`.
- **Fix:** Removed the path alias from `tsconfig.build.json` (set to `{}`). Node's standard resolution at runtime uses the pnpm workspace symlink → `packages/shared/package.json` `exports` map → `dist/index.cjs`, which is identical at runtime but doesn't make tsc try to emit the source. Also added `exclude: ["dist", "**/*.{js,cjs,mjs}"]` to `packages/shared/vitest.config.ts` as a belt-and-braces guard.
- **Files modified:** `apps/api/tsconfig.build.json`, `packages/shared/vitest.config.ts`. Also deleted the stale emitted files from `packages/shared/src/`.
- **Verification:** `pnpm turbo run test` 4/4 green; `ls packages/shared/src` shows only `.ts` files.
- **Committed in:** `bcc335f` (Task 3 commit).

**3. [Rule 1 — Bug] `nest build` silently emitting nothing on second run**
- **Found during:** Task 3 (after the path-alias fix above).
- **Issue:** `nest build` runs `deleteOutDir: true` which nukes `dist/` before tsc emits, but the leftover `tsconfig.build.tsbuildinfo` at project root made tsc think the build was already complete — it emitted nothing while `dist/` stayed empty.
- **Fix:** `incremental: false` in `tsconfig.build.json`. Type-check (which uses `tsconfig.json`) still benefits from incremental.
- **Files modified:** `apps/api/tsconfig.build.json`.
- **Verification:** Wiped `.turbo`, `dist`, and tsbuildinfo, ran `pnpm turbo run build` twice — first ran fresh (10.6s), second was fully cached (63ms, "FULL TURBO"), and `apps/api/dist/{main,app.module,app.controller}.js` were present after both.
- **Committed in:** `bcc335f` (Task 3 commit).

**4. [Rule 2 — Missing Critical] `passWithNoTests: true` for `apps/web` Vitest**
- **Found during:** Task 3 (first `pnpm turbo run test`).
- **Issue:** Plan 01 ships no web specs (those land in Plan 03 + Phase 9). Vitest's default exit-code-1 on "no test files" failed the whole `turbo run test` pipeline.
- **Fix:** Added `test.passWithNoTests: true` to `apps/web/vitest.config.ts`. To be re-evaluated when Plan 03 lands the first web spec (drop the flag).
- **Files modified:** `apps/web/vitest.config.ts`.
- **Verification:** `pnpm turbo run test` 4/4 green.
- **Committed in:** `bcc335f` (Task 3 commit).

**5. [Rule 3 — Blocking] Added `mongoose@^9.6.0` as `apps/api` devDependency**
- **Found during:** Task 3 (writing the Wave-0 smoke spec).
- **Issue:** Plan 02 plans `@nestjs/mongoose` + `mongoose`, but Task 3's smoke spec needs to **prove** the in-memory Mongo replica set accepts a real driver connection — the only way to verify "mongodb-memory-server actually works" is to connect with a real client and read back a document. Without a driver, the Wave-0 verify can only assert the URI string exists.
- **Fix:** Installed `mongoose@^9.6.0` as a devDependency. Plan 02 will promote it to a regular dependency when wiring `@nestjs/mongoose`.
- **Files modified:** `apps/api/package.json`.
- **Verification:** `wave0-infra.spec.ts` mongoose test connects, inserts, reads back — passes in 2.7s on first run, instant on cache.
- **Committed in:** `bcc335f` (Task 3 commit).

---

**6. [Rule 3 — Blocking] Flat ESLint config + replaced web's `next lint` with `eslint src`**
- **Found during:** post-Task-3 plan-level `<verification>` check (orchestrator's final pre-done step).
- **Issue:** Plan `<verification>` block requires `pnpm turbo run lint type-check test build` to be green. Per-task verifies only ran type-check/test/build. Lint failed everywhere: `shared` + `api` ran `eslint src` with no config (exit 1), `web` ran `next lint` which started an interactive setup prompt (exit 1 + deprecation notice for Next 16).
- **Fix:** Created a root `eslint.config.mjs` (flat config) with `@eslint/js` + `typescript-eslint` recommended; added `no-explicit-any` error, `no-empty` (no silent catch), unused-vars warn (underscore-prefixed allowed); test files relax the `any` ban + unused-vars. Swapped `apps/web/package.json` `lint` from `next lint` to `eslint src`. Pinned `@eslint/js@^9` (v10 wants eslint@10). Dropped two stale `eslint-disable` directives left over from earlier iterations (rules weren't active so they were reported as unused).
- **Files modified:** `eslint.config.mjs` (new), `apps/web/package.json`, `apps/api/src/main.ts`, `apps/api/test/setup.ts`, root `package.json` + `pnpm-lock.yaml` (devDep delta).
- **Verification:** `pnpm turbo run lint type-check test build` — 12/12 green.
- **Committed in:** `fccda67`.

---

**Total deviations:** 6 auto-fixed (3 blocking, 2 bugs, 1 missing critical)
**Impact on plan:** No scope creep. Deviation 1 pulled SWC config from Task 3 forward; Deviations 2+3 were tsc/nest plumbing bugs surfaced by the verification gates (working as designed); Deviation 4 is a Plan-01-only flag; Deviation 5 added `mongoose` one plan early so the test harness can actually verify what it claims; Deviation 6 lands the minimal ESLint config the `<verification>` block implicitly required.

## Issues Encountered

- **`pnpm` aliased to a broken `_lc pnpm` wrapper.** Every interactive `pnpm` call in zsh prints `(eval):N: command not found: _lc` because of a shell hook. Resolved by using the absolute path `/Users/milankatia/.volta/bin/pnpm` in every Bash invocation. The hook noise is harmless — commits still landed correctly.
- **Multi-step bash chains with `&&` got the `_lc` error.** Split into separate `Bash` tool invocations.
- **mongodb-memory-server post-install downloaded the Mongo binary twice** (once via pnpm's post-install hook → `node_modules/.cache/mongodb-memory-server/`, once during the first Vitest run → `~/.cache/mongodb-binaries/`). Cache-key mismatch between pnpm's project-local cache and the binary's default home-cache. Not a blocker — second + later runs hit the home cache and are instant. Could be tightened by setting `MONGOMS_DOWNLOAD_DIR=node_modules/.cache/mongodb-memory-server` in `.env.test` if it becomes annoying in CI.

## User Setup Required

None — no external service configuration required for Plan 01. The local Docker Compose stack (Mongo + Redis) is optional during this plan; Plan 02 wires `@nestjs/mongoose` + `MongooseModule.forRoot` and will require it (or an Atlas connection string).

## Next Phase Readiness

- **For Plan 02 (env Zod schema + Terminus health + CacheService):** `.env.example` is complete; `apps/api/.env.test` has ≥32-char test secrets so the Zod schema passes during tests; `ioredis@5.11.0` is installed and ready to wire into `CacheModule`; `ioredis-mock` is reachable via `ensureRedis()`.
- **For Plan 03 (auth + DPDP consent):** `mongodb-memory-server` replica-set is ready for multi-document transactions; `passport-google-oauth20@2.0.0` is installed + the OAuth mock helper is reachable; `makeUserSeed()` factory is in place.
- **For Plan 04 (branded Verdict + forbid-verbs CI):** `packages/shared` barrel is the landing point — drop `verdict.ts` next to `api-errors.ts` and re-export from `index.ts`. `tsup` config picks it up with no changes.
- **Across all later phases:** monorepo layout, build/test/type-check/lint task graph, and the `@finsight/shared` import contract are stable.

## Known Stubs

None. All files in Plan 01 are functional — `SHARED_SENTINEL` is a deliberate proof-of-life value that will be removed once the shared package has substantive exports (Verdict + DTOs).

## Self-Check: PASSED

Verified file existence:
- `turbo.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `docker-compose.yml`, `.env.example`, `.gitignore`, `package.json`, `.npmrc` — FOUND
- `apps/web/{package.json,tsconfig.json,next.config.ts,postcss.config.mjs,vitest.config.ts,next-env.d.ts,src/app/layout.tsx,src/app/page.tsx,src/app/globals.css,src/lib/api-client.ts}` — FOUND
- `apps/api/{package.json,tsconfig.json,tsconfig.build.json,nest-cli.json,vitest.config.ts,.env.test,src/main.ts,src/app.module.ts,src/app.controller.ts,src/app.controller.spec.ts,test/setup.ts,test/google-oauth.mock.ts,test/factories/user.factory.ts,test/types/ioredis-mock.d.ts,test/wave0-infra.spec.ts}` — FOUND
- `packages/shared/{package.json,tsconfig.json,tsup.config.ts,vitest.config.ts,src/index.ts,src/api-errors.ts,test/setup.ts,test/api-errors.spec.ts,test/api-errors.test-d.ts}` — FOUND

Verified commits via `git log --oneline -5`:
- `453a307 chore(01-01): scaffold monorepo root - turbo + pnpm workspaces + docker compose` — FOUND
- `ae7d679 feat(01-01): scaffold apps/web + apps/api + packages/shared with cross-workspace type round-trip` — FOUND
- `bcc335f chore(01-01): land Wave-0 test infrastructure (mongo-memory + ioredis-mock + Google OAuth mock)` — FOUND

Verified build artifacts present after `pnpm turbo run build`:
- `apps/api/dist/{main,app.module,app.controller}.js` — FOUND
- `packages/shared/dist/{index.js,index.cjs,index.d.ts,index.d.cts}` — FOUND
- `apps/web/.next/BUILD_ID` — FOUND

---
*Phase: 01-foundation-auth-compliance-contract*
*Completed: 2026-05-28*
