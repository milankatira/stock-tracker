# Phase 1: Foundation, Auth & Compliance Contract — Research

**Researched:** 2026-05-28
**Domain:** Monorepo scaffolding · NestJS 11 auth (email/password + Google OAuth) · MongoDB Atlas + Redis wiring · centralised cache facade · DPDP consent · compliance verdict contract
**Confidence:** HIGH (all core packages npm-verified 2026-05-28; auth/security patterns from official NestJS docs + OWASP 2026)

## Summary

Phase 1 is the load-bearing foundation: every later phase inherits this monorepo layout, auth posture, cache contract, and compliance verdict type. Three invariants must be enforced **by construction** in this phase, not by convention:

1. **Every Redis key carries a TTL** — enforced by a thin custom `CacheService` over `ioredis` whose `set()` signature makes `ttlSeconds` a **required positional argument**. `cache-manager` is explicitly rejected because its TTL is optional.
2. **Verdict is a branded type** in `packages/shared` constructed only via `makeVerdict()` — `as Verdict` casts of `"BUY"` won't compile. Paired with a CI grep guard for forbidden verbs across code, prompt templates, and SEO copy.
3. **Secrets validated at boot** via a Zod schema in `@nestjs/config` — the app fails to start if `MONGO_URI`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, or `GEMINI_API_KEY` is missing.

**Primary recommendation:** Scaffold a Turborepo + pnpm-workspaces monorepo with `apps/web` (Next.js 15.5.x), `apps/api` (NestJS 11.1.x), `packages/shared` (Zod schemas + branded `Verdict` type + DTOs). Auth = NestJS-owned JWT (access 15 min `SameSite=Lax`, refresh 7 d `SameSite=Strict` path-scoped) with bcrypt cost-12 password hashing + Google OAuth via `passport-google-oauth20`. MongoDB Atlas **M10** in `ap-south-1` (provision M10 now so Phase 6 vector search doesn't need a tier migration). Redis 7 via `ioredis 5.11.0`. Health checks via `@nestjs/terminus` + custom 20-line `RedisHealthIndicator`. DPDP consent stored as an immutable audit chain (`supersedesId` pointer for revoke/re-grant).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **FOUND-01** | Turborepo monorepo hosts Next.js 15 web + NestJS 11 API that can call each other | § Standard Stack (Turborepo 2.9.15 + pnpm workspaces) · § Architecture Patterns → Monorepo Layout · § Code Examples → `turbo.json`, root `package.json` |
| **FOUND-02** | API connects to MongoDB Atlas (ap-south-1) + Redis, with health checks passing | § Standard Stack (Mongoose 9.6 + ioredis 5.11) · § Architecture Patterns → Health Checks · § Code Examples → `MongooseHealthIndicator` + custom `RedisHealthIndicator`; `/health` (liveness) and `/health/ready` (readiness) split |
| **FOUND-03** | Shared TypeScript DTOs/types in `packages/shared` consumed by both apps | § Architecture Patterns → `packages/shared` · § Code Examples → `tsconfig` path alias `@finsight/shared/*` + `"type": "module"` exports map |
| **FOUND-04** | Secrets load from env/secret manager, never hardcoded | § Standard Stack (`@nestjs/config` 4.0.4 + `zod` 4.4.3) · § Architecture Patterns → ConfigModule with Zod schema, fail-fast at boot · § Secret Management (Doppler dev / GCP Secret Manager prod) |
| **FOUND-05** | Centralised Redis cache facade enforces TTL on every key | § Architecture Patterns → Custom `CacheService` over `ioredis` with **required** `ttlSeconds` arg · § Don't Hand-Roll (cache facade is the deliberate exception) · § Code Examples → `CacheService.set<T>(key, value, ttlSeconds)` |
| **AUTH-01** | User can sign up with email + password | § Standard Stack (`bcrypt 6.0.0`, `class-validator 0.15.x`) · § Architecture Patterns → AuthModule layout · § Code Examples → `LocalStrategy`, signup DTO, **bcrypt cost factor 12** |
| **AUTH-02** | User can log in with email + password and stays logged in across refreshes (JWT) | § Architecture Patterns → JWT session (15 min access HttpOnly cookie + 7 d refresh rotation with reuse detection) · § Common Pitfalls → "JWT in localStorage" |
| **AUTH-03** | User can sign up / log in with Google OAuth | § Standard Stack (`passport-google-oauth20 2.0.0`) · § Architecture Patterns → `GoogleStrategy` → find-or-create → mint own JWT · § Code Examples → callback handler |
| **AUTH-04** | User can log out from any page | § Architecture Patterns → `/auth/logout` clears both cookies + revokes refresh token hash in Redis · § Code Examples |
| **AUTH-05** | DPDP-compliant consent (timestamped record) on first sign-up | § Architecture Patterns → ConsentRecord schema (immutable, `supersedesId` chain) · § Code Examples → consent capture in signup transaction |
| **COMP-01** | Every verdict is a typed enum (`STRONG_SCORE \| CAUTION \| WEAK_SCORE`) — no BUY/SELL/HOLD anywhere | § Architecture Patterns → **branded type** in `packages/shared` + `makeVerdict()` smart constructor · § Code Examples · § Common Pitfalls → "advice language baked in" · CI grep guard for forbidden verbs |

## Project Constraints (from CLAUDE.md)

The user's CLAUDE.md (project + global rules) imposes the following directives that the planner MUST honor in every Phase 1 task:

- **No hardcoded secrets** — load from env / secret manager (FOUND-04 satisfies this directly).
- **No bare `any`** — use `unknown` + Zod validation at boundaries.
- **Test file per source file** — every new `.ts` source file in `apps/api/src/**` and `apps/web/src/**` ships with a sibling `*.spec.ts` / `*.test.ts`.
- **Update tests on behavior change** — auth state machine has explicit `*.e2e-spec.ts` coverage.
- **No empty catch blocks** — handle, log, or rethrow.
- **DTO validation mandatory** — global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` on the Nest app.
- **`locationId` (and any identity field) is derived server-side from the JWT, never accepted from client body/query/params** — `userId` in this project is the equivalent.
- **No `v-html` / `dangerouslySetInnerHTML` without sanitiser** — not yet relevant in Phase 1 (no rich AI content rendered) but flag for Phase 4 carry-over.
- **Use a logger (not `console.log`)** — Nest's built-in `Logger` is acceptable; pino is the upgrade path.
- **Docs updated alongside public-API changes** — Phase 1 introduces the `/auth/*` and `/health*` endpoints; their shapes are documented in `packages/shared/openapi/auth.yaml` or inline via `@nestjs/swagger`.

## Standard Stack

All versions verified live against npm registry on **2026-05-28**.

### Core (Phase 1 — new in this phase or first wired up here)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `turbo` | `2.9.15` | Monorepo task runner / build cache | Industry-standard for TS monorepos; remote cache supports CI later. |
| `pnpm` (workspace) | `10.28.2` (verified locally) | Package manager + workspace primitive | Fast, disk-efficient, deterministic; Turborepo's recommended PM. |
| `next` | `15.5.x` (locked, do not upgrade to 16) | Next.js App Router | Locked by project decision. 15.5 is the stable line with React 19 + shadcn compatibility. |
| `@nestjs/core` + `@nestjs/common` + `@nestjs/platform-express` | `11.1.x` | NestJS backend | Locked. All `@nestjs/*` packages MUST stay on the 11.x line — mixing majors causes peer-dep failures. |
| `@nestjs/config` | `4.0.4` | Env loading + ConfigModule | Standard NestJS env handling. Pair with Zod for validation. |
| `zod` | `4.4.3` | Schema validation (env, shared DTOs, external payloads) | Used in `packages/shared` for cross-app DTOs and in `ConfigModule` for boot-time env validation. |
| `nestjs-zod` | `5.4.0` | `ZodValidationPipe`, `createZodDto` | Bridges Zod schemas into Nest DTO classes — single source of truth for shapes shared with the Next app. |
| `@nestjs/mongoose` | `11.0.x` | Mongoose integration | Aligned with Nest 11. |
| `mongoose` | `9.6.x` | MongoDB ODM | Locked. `@Schema()` decorator classes + `SchemaFactory.createForClass()`. |
| `ioredis` | `5.11.0` | Redis client (cache + BullMQ backend + rate-limit store) | Industry default for Node Redis 7. Shared connection across CacheService + Throttler + (later) BullMQ. |
| `@nestjs/jwt` | `11.0.2` | JWT sign/verify | Locked auth path. |
| `@nestjs/passport` | `11.0.5` | Passport adapter | Standard Nest auth. |
| `passport` | `0.7.0` (Passport core, peer of strategies) | — | Auto-installed peer. |
| `passport-jwt` | `4.0.1` | JwtStrategy guard | Reads JWT from HttpOnly cookie via `jwtFromRequest: (req) => req.cookies?.access_token`. |
| `passport-local` | `1.0.0` | LocalStrategy (email/password login) | Standard. |
| `passport-google-oauth20` | `2.0.0` | Google OAuth identity | Google is identity provider only — our backend mints the session JWT after Google verifies the user. |
| `bcrypt` | `6.0.0` | Password hashing | OWASP 2026 baseline: **cost factor 12**. (v6 dropped Node 16 support — Node 24 verified locally, fine.) |
| `class-validator` | `0.15.x` | DTO validation decorators | Platform-rule mandatory. Used on `@Body()` DTOs not already covered by `nestjs-zod`. |
| `class-transformer` | `0.5.x` | DTO transform/plain↔class | Required peer of `class-validator` under Nest's `ValidationPipe`. |
| `cookie-parser` | `1.4.7` | Parse HttpOnly cookies | Required so `passport-jwt` can read tokens from cookies. |
| `helmet` | `8.2.0` | Security headers middleware | OWASP-recommended defaults (CSP, HSTS, frameguard, X-Content-Type-Options). |
| `@nestjs/throttler` | `6.5.0` | Rate limiting | Apply globally with stricter buckets on `/auth/*` (e.g. 5 req/min/IP on login/signup). Use `ThrottlerStorageRedisService` so limits work across instances. |
| `csrf-csrf` | `4.0.3` | Double-submit CSRF | `csurf` is deprecated; `csrf-csrf` is the maintained successor. Required because auth uses cookies. |
| `@nestjs/terminus` | `11.1.1` | Health-check framework | Ships `MongooseHealthIndicator`. **No Redis indicator built in** — write a 20-line custom one (see Code Examples). |
| `vitest` | `3.x` | Unit + integration tests | Use Vitest on **both** sides (web and api) for a single shared testing UX. Add a `@nestjs/testing` adapter where needed. |
| `@types/*` | latest | TS types for `cookie-parser`, `passport-*`, `bcrypt`, `node` | Dev-only. |

### Supporting (Phase 1)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `argon2` | `0.44.0` | Alternative password hash | Argon2id is the OWASP-preferred algorithm, but bcrypt is fine and integrates with more existing tooling. **Use bcrypt** unless the team explicitly wants Argon2id; the difference is not material at v1 user volume. |
| `@songkeys/nestjs-redis-health` | community | Terminus Redis indicator | OPTIONAL — only if you want to avoid the 20-line custom indicator. Custom is preferred (zero new deps). |
| `pino` + `nestjs-pino` | latest | Structured logging | Optional for Phase 1; recommend adopting from day one so logs are JSON for later observability. PII-redaction config required (DPDP). |
| `@nestjs/swagger` | `11.x` | OpenAPI spec generation | Nice-to-have in Phase 1; cheap when added now, expensive when retrofitted later. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff / Why Rejected |
|------------|-----------|--------------------------|
| Custom `CacheService` over `ioredis` | `@nestjs/cache-manager` 3.1.2 + `cache-manager` 7.2.8 + `@keyv/redis` 5.1.6 | **Rejected for FOUND-05.** `cache-manager.set(key, value, ttl?)` treats TTL as optional — "every key has a TTL" becomes a code-review rule, not a type invariant. Building a 60-line custom service over `ioredis` makes `ttlSeconds` a required positional argument enforced by the compiler. |
| bcrypt (cost 12) | `argon2id` | Argon2id is OWASP-preferred but bcrypt is broadly supported and faster to ship; difference is immaterial at v1 scale. Document the choice. |
| `csrf-csrf` | `csurf` | `csurf` is deprecated by Express maintainers. Do not use. |
| `@nestjs/terminus` Redis | `@songkeys/nestjs-redis-health` | Community package adds a dep for ~20 lines of code; custom indicator preferred. |
| JWT in `Authorization: Bearer` header | JWT in `HttpOnly`, `Secure`, `SameSite=Lax` cookie | **Cookie chosen.** Header tokens force the SPA to store them somewhere — `localStorage` is XSS-stealable (PITFALLS.md §7), `sessionStorage` doesn't survive refresh (violates AUTH-02). HttpOnly cookie is the correct posture for an auth-cookie-from-the-same-origin SSR app. |
| Single 24h stateless access JWT, no refresh | Short-lived access (15 min) + rotating refresh (7 d) with reuse detection | **Refresh tokens chosen.** [ASSUMED] — see Open Questions. Refresh adds complexity; if v1 cuts complexity, drop refresh and ship single 24h access cookie. |
| Doppler (dev) + GCP Secret Manager (prod) | AWS Secrets Manager, Infisical, 1Password CLI, plain `.env` | All viable. Picked Doppler for dev (free tier, simple `doppler run -- pnpm dev` CLI injection) and GCP Secret Manager for prod to pair with Atlas + likely future Cloud Run / GKE hosting. **Decide once, document, move on.** |
| MongoDB Atlas M10 from day one | M0 free / M2 shared | **M10 chosen.** Atlas Vector Search (Phase 6) and Atlas Search (Phase 5) require dedicated tiers (M10+). Provisioning M10 in Phase 1 avoids a tier migration mid-roadmap. M0/M2 also lack PrivateLink + IP allowlists beyond basic ranges. |
| Connection-string SCRAM auth to Atlas | X.509 cert auth | SCRAM is fine for v1 with rotated credentials in a secret manager. X.509 is a hardening upgrade path. |

**Installation:**

```bash
# Root (monorepo)
pnpm dlx create-turbo@latest finsight --package-manager pnpm
cd finsight

# apps/web — Next.js 15 + Tailwind v4 + shadcn
cd apps/web
pnpm create next-app@15 . --ts --app --tailwind --eslint --src-dir --import-alias "@/*"
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input label form alert sonner dialog tabs

# apps/api — NestJS 11
cd ../api
pnpm dlx @nestjs/cli@11 new . --package-manager pnpm --skip-git --strict
pnpm add @nestjs/config zod nestjs-zod
pnpm add @nestjs/mongoose mongoose
pnpm add @nestjs/jwt @nestjs/passport passport passport-local passport-jwt passport-google-oauth20
pnpm add bcrypt class-validator class-transformer
pnpm add cookie-parser helmet csrf-csrf
pnpm add @nestjs/throttler ioredis
pnpm add @nestjs/terminus
pnpm add -D @types/passport-local @types/passport-jwt @types/passport-google-oauth20 @types/bcrypt @types/cookie-parser
pnpm add -D vitest @vitest/coverage-v8

# packages/shared — DTOs + branded Verdict
cd ../../packages/shared
pnpm init
pnpm add zod
pnpm add -D typescript tsup vitest

# Root dev tools
cd ../..
pnpm add -Dw eslint prettier typescript turbo
```

**Version verification:** All versions above queried live against the npm registry on 2026-05-28 with `npm view <pkg> version`. The locked stack versions from `.planning/research/STACK.md` were re-confirmed; new packages introduced in this phase have current versions noted.

## Architecture Patterns

### Recommended Monorepo Layout

```
finsight/
├── apps/
│   ├── web/                            # Next.js 15 — frontend + auth UI + middleware
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (marketing)/        # public landing (Phase 9)
│   │   │   │   ├── (auth)/             # /login, /signup, /forgot
│   │   │   │   ├── (app)/              # protected app — checked by middleware.ts
│   │   │   │   └── api/                # ONLY if needed for OAuth start; prefer NestJS-owned flow
│   │   │   ├── lib/
│   │   │   │   └── api-client.ts       # typed fetch using @finsight/shared DTOs
│   │   │   └── middleware.ts           # JWT cookie check for /app/*
│   │   ├── tailwind.config.ts          # NOT NEEDED (Tailwind v4 is CSS-first); only globals.css with @theme
│   │   └── package.json
│   ├── api/                            # NestJS 11
│   │   ├── src/
│   │   │   ├── main.ts                 # Helmet, ValidationPipe, cookie-parser, csrf, listen
│   │   │   ├── app.module.ts           # Wires ConfigModule, MongooseModule, ThrottlerModule, sub-modules
│   │   │   ├── config/
│   │   │   │   ├── env.schema.ts       # Zod schema validating process.env at boot
│   │   │   │   └── config.module.ts
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.module.ts
│   │   │   │   │   ├── auth.controller.ts   # /auth/signup, /login, /logout, /refresh, /google, /google/callback, /me
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── strategies/
│   │   │   │   │   │   ├── local.strategy.ts
│   │   │   │   │   │   ├── jwt.strategy.ts
│   │   │   │   │   │   └── google.strategy.ts
│   │   │   │   │   ├── guards/
│   │   │   │   │   │   ├── jwt-auth.guard.ts
│   │   │   │   │   │   └── google-oauth.guard.ts
│   │   │   │   │   ├── dto/
│   │   │   │   │   │   ├── signup.dto.ts
│   │   │   │   │   │   └── login.dto.ts
│   │   │   │   │   ├── tokens/
│   │   │   │   │   │   ├── token.service.ts  # mint access + refresh; rotate; reuse-detect
│   │   │   │   │   │   └── refresh-store.ts  # Redis-backed hashed refresh per user
│   │   │   │   │   └── decorators/
│   │   │   │   │       ├── current-user.decorator.ts
│   │   │   │   │       └── public.decorator.ts
│   │   │   │   ├── users/
│   │   │   │   │   ├── users.module.ts
│   │   │   │   │   ├── user.schema.ts        # Mongoose @Schema
│   │   │   │   │   └── users.service.ts
│   │   │   │   ├── consent/
│   │   │   │   │   ├── consent.module.ts
│   │   │   │   │   ├── consent.schema.ts     # immutable audit chain
│   │   │   │   │   └── consent.service.ts
│   │   │   │   ├── cache/
│   │   │   │   │   ├── cache.module.ts
│   │   │   │   │   ├── cache.service.ts      # required-TTL facade over ioredis
│   │   │   │   │   └── ttl-policy.ts         # central TTL constants (24h, 7d, etc.)
│   │   │   │   ├── compliance/
│   │   │   │   │   ├── compliance.module.ts  # interceptor shape in Phase 1, active in Phase 4
│   │   │   │   │   └── verdict.ts            # re-exports + helpers; canonical type lives in @finsight/shared
│   │   │   │   └── health/
│   │   │   │       ├── health.module.ts
│   │   │   │       ├── health.controller.ts  # /health (liveness), /health/ready (readiness)
│   │   │   │       └── redis.health.ts       # custom RedisHealthIndicator
│   │   │   └── common/
│   │   │       ├── filters/
│   │   │       │   └── all-exceptions.filter.ts  # never leak stack traces
│   │   │       └── interceptors/
│   │   │           └── logging.interceptor.ts
│   │   └── package.json
├── packages/
│   ├── shared/                         # Zod schemas + branded Verdict + DTOs + API client types
│   │   ├── src/
│   │   │   ├── verdict.ts              # branded `Verdict` + `makeVerdict()`
│   │   │   ├── auth.dto.ts             # SignupDto, LoginDto, MeResponseDto (zod schemas)
│   │   │   ├── consent.dto.ts
│   │   │   ├── api-errors.ts           # discriminated-union error shape
│   │   │   └── index.ts
│   │   ├── package.json                # "exports" map: { ".": "./dist/index.js", "./*": "./dist/*.js" }
│   │   └── tsup.config.ts
│   └── eslint-config/                  # shared flat-config preset
│       └── package.json
├── .env.example
├── .gitignore
├── docker-compose.yml                  # local Mongo replica set + Redis 7
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json                  # paths: "@finsight/shared/*" → "packages/shared/src/*"
├── package.json                        # "workspaces": ["apps/*", "packages/*"]
└── README.md
```

### Pattern 1: Required-TTL Cache Facade (FOUND-05)

**What:** Thin `CacheService` over `ioredis` where every `set()` requires `ttlSeconds` as a positional argument — making "untagged cache key" a compile error rather than a code-review finding.
**When to use:** Every cached read in the project. The `ioredis` client itself is NEVER injected into other modules — only `CacheService`.
**Why:** `cache-manager`'s `set(key, value, ttl?)` makes TTL optional. The compiler can't enforce an invariant if the signature lets you skip it.

### Pattern 2: Branded Verdict Type (COMP-01)

**What:** `Verdict` is a branded string type in `packages/shared/src/verdict.ts`, constructible only via `makeVerdict()`. The three allowed values are `STRONG_SCORE`, `CAUTION`, `WEAK_SCORE`.
**When to use:** Any field, DTO, response, or score record that carries a verdict.
**Why:** A plain union `'A' | 'B' | 'C'` permits `'BUY' as Verdict` casts at any call site. A branded type rejects those at the constructor. Pair with a CI grep guard (`scripts/forbid-verbs.sh`) that fails the build if `BUY|SELL|HOLD|recommend|target price|you should invest` appears in `apps/`, `packages/`, or `prompts/`.

### Pattern 3: Boot-Time Env Validation (FOUND-04)

**What:** A Zod schema in `apps/api/src/config/env.schema.ts` describes every required env var with the right type (URL, secret string min length, port number, enum). `ConfigModule.forRoot({ validate: (raw) => envSchema.parse(raw) })` makes the Nest app crash at boot if any required var is missing or malformed.
**When to use:** Every env var the app reads.
**Why:** Catches missing/typo'd secrets at deploy time, not at the first request that needs them.

### Pattern 4: JWT Session = Short Access Cookie + Rotating Refresh (AUTH-02)

**What:**
- **Access token**: 15 min, signed with `JWT_ACCESS_SECRET`, set in cookie `access_token` — `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- **Refresh token**: 7 d, signed with `JWT_REFRESH_SECRET`, set in cookie `refresh_token` — `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/auth/refresh`.
- On `/auth/refresh`: verify refresh JWT, look up `sha256(refreshToken)` in Redis at key `refresh:{userId}` — if it doesn't match, the token has been used twice → revoke the whole session (delete the key, force re-login). If it matches, mint a new access + new refresh, store new hash, return.

**When to use:** All authenticated routes.
**Why SameSite reconciliation:** PITFALLS.md §7 says `SameSite=Strict`. Google OAuth callback is a top-level cross-site GET redirect, and `Strict` blocks the session cookie from being sent on that redirect, breaking the "you are now logged in" round-trip. **Lax for access** (allows top-level GET navigation to carry the cookie), **Strict for refresh** (refresh is only ever called by our own frontend via a path-scoped cookie, never via cross-site navigation).

### Pattern 5: Google OAuth → Our Own JWT (AUTH-03)

**What:** `GoogleStrategy` exchanges code → Google profile. On callback, `AuthService.findOrCreateGoogleUser(profile)` upserts a user record (linked by verified email), creates a consent record on first signup, and our `TokenService` mints our own access + refresh JWTs. Google is **identity** only; the session token is ours.
**When to use:** `/auth/google` (initiates) → `/auth/google/callback` (handles Google's redirect).
**Why:** Decouples from Google's token format and lifetime. Our backend owns session expiry, revocation, and rotation.

### Pattern 6: DPDP Consent as an Immutable Audit Chain (AUTH-05)

**What:** Each `ConsentRecord` document is immutable. To revoke or re-grant, write a NEW record whose `supersedesId` points at the prior one. The "current" consent for a user is `findOne({ userId, supersedesId: null })`.

```ts
// Mongoose schema fields
{
  userId: ObjectId,                            // ref User
  consentVersion: '1.0.0',                     // policy doc semver/hash — bump when wording changes
  granular: { analytics: boolean, marketing: boolean, aiNarrative: boolean },
  ip: string,                                  // captured at consent
  userAgent: string,
  timestamp: Date,                             // immutable, indexed
  supersedesId: ObjectId | null,               // chain pointer; null = current
  source: 'signup' | 'settings' | 'reconsent'
}
```

**When to use:** First signup (record created in same transaction as user). Settings page consent toggle (new record with `supersedesId` = current's `_id`). Policy version bump (force reconsent, new record with bumped `consentVersion`).
**Why:** DPDP Rules 2025 require **demonstrable historical consent**, not just current state. An update-in-place loses the audit trail; the supersedes chain preserves it forever.

### Pattern 7: Health Checks — Split Liveness vs Readiness (FOUND-02)

**What:**
- `GET /health` (liveness) → 200 if the process is up, no dependency checks. Use for k8s/Cloud Run liveness probe — restarting the pod won't fix a Mongo outage.
- `GET /health/ready` (readiness) → checks Mongo (`MongooseHealthIndicator`) + Redis (custom indicator that PINGs). Use for readiness probe / load balancer health.

**Why:** Tying liveness to dependencies causes restart loops when Mongo blips. Readiness gates traffic but doesn't restart.

### Pattern 8: Next.js Middleware for Protected Routes

**What:** `apps/web/src/middleware.ts` reads the `access_token` cookie and, for paths under `/app/*`, verifies it (using `jose` for edge-runtime-safe JWT verify with the same `JWT_ACCESS_SECRET`). On failure, redirect to `/login?next={path}`.
**Why:** Server-side gate before any RSC fetches kick off. The middleware does NOT call the NestJS API; it only verifies the JWT signature locally for fast rejection. The API still re-verifies on every request (defense-in-depth).

### Pattern 9: Reading the JWT in Server Components

**What:** In RSC files under `/app/*`, use `import { cookies } from 'next/headers'` → `cookies().get('access_token')?.value`. Pass it through to the typed API client which forwards it as `Cookie:` header on `fetch()` calls to NestJS.
**Why:** RSC runs server-side and can read HttpOnly cookies. Client Components cannot — they must call route handlers or server actions that proxy to the API.

### Anti-Patterns to Avoid

- **JWT in `localStorage`** — XSS-stealable. Always HttpOnly cookies.
- **`NEXT_PUBLIC_GEMINI_KEY`** or any backend secret prefixed `NEXT_PUBLIC_*` — exposes secrets to the browser. Phase 1 doesn't touch Gemini, but flag the rule now.
- **`SameSite=None` for the access cookie** — required only for true cross-site embedding. Lax is correct here.
- **Trusting client-supplied `userId`** — always read from the validated JWT via `@CurrentUser()` decorator. Platform rule.
- **Updating a `ConsentRecord` in place** — loses the audit chain. Always insert a new doc with `supersedesId`.
- **`cache-manager.set(key, value)` with no TTL** — `cache-manager` allows it, FOUND-05 forbids it. Hence the custom facade.
- **Loose verdict types** — `string` or `'STRONG_SCORE' | 'CAUTION' | 'WEAK_SCORE'` (plain union) — use the branded type.
- **`tailwind.config.js`** — Tailwind v4 is CSS-first via `@theme` in `globals.css`. The shadcn CLI initializes correctly; don't add a config file back.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT sign/verify | Custom HMAC + base64 | `@nestjs/jwt 11.0.2` (wraps `jsonwebtoken`) | Edge cases: alg confusion attacks, expiry, audience, issuer claims. |
| Password hashing | SHA-256 + custom salt | `bcrypt 6.0.0` cost factor 12 | Salt management, timing-safe compare, work-factor migration. |
| Google OAuth flow | Manual auth-code exchange | `passport-google-oauth20 2.0.0` | State validation, PKCE, redirect URI handling, token refresh. |
| Rate limiting | In-memory Map / setTimeout | `@nestjs/throttler 6.5.0` + Redis storage | Survives restarts, works across instances, sliding/fixed window. |
| Input validation | Hand-written `if` chains | `zod 4.4.3` + `nestjs-zod 5.4.0` (shared schemas) and/or `class-validator` | Shape, type coercion, error messages, derived TS types. |
| CSRF protection | Origin-header check only | `csrf-csrf 4.0.3` (double-submit) | Cookie-based auth requires CSRF defense. `csurf` is deprecated. |
| Health checks | Custom `/health` route | `@nestjs/terminus 11.1.1` + custom 20-line Redis indicator | Consistent indicator pattern; ships Mongo + (with one custom file) Redis. |
| Security headers | Custom `res.setHeader` | `helmet 8.2.0` | CSP, HSTS, frameguard, X-Content-Type-Options — getting these right by hand is tedious. |
| OAuth state / CSRF token randomness | `Math.random()` | `crypto.randomBytes(32).toString('base64url')` | `Math.random()` is not cryptographically secure. |
| Cookie parsing | `req.headers.cookie.split(';')` | `cookie-parser 1.4.7` | Edge cases: quoted values, equals signs in values, percent-encoding. |
| Env var validation at boot | Read `process.env.X` lazily | `@nestjs/config 4.0.4` + Zod schema | Fail-fast at startup, not at first use. |
| Refresh-token reuse detection | "It's signed, it's fine" | Hash → store in Redis → compare on use → revoke session on mismatch | A stolen refresh token used twice (real client + attacker) is the canonical detection signal. |
| Mongo connection pooling | Manual `MongoClient.connect()` per request | `@nestjs/mongoose 11` | Built-in pooling, reconnect, health hooks. |

**Key insight:** Auth is the densest cluster of "looks simple, has 50 footguns" problems in web dev. Use battle-tested libraries for every primitive; the only thing you should be writing yourself in Phase 1 is the **shape** that composes them (which strategy, which cookie config, which Zod schema, which TTL).

**Deliberate exception:** The Redis cache facade IS hand-rolled — but it's a 60-line file whose entire purpose is to enforce the FOUND-05 invariant the library wouldn't enforce for us.

## Common Pitfalls

### Pitfall 1: Verdict enum bypassed by `as Verdict` casts

**What goes wrong:** `Verdict` defined as `'STRONG_SCORE' | 'CAUTION' | 'WEAK_SCORE'` is a plain string-literal union. Six months from now, a developer under deadline writes `verdict: 'BUY' as Verdict` to ship a feature. TypeScript accepts the cast. COMP-01 is silently broken.
**Why it happens:** Plain unions are escapable with `as`. Reviewers don't grep for casts.
**How to avoid:** Branded `Verdict` type + `makeVerdict()` smart constructor in `packages/shared`. `makeVerdict('BUY')` is a runtime throw; `'BUY' as Verdict` is a type error because the brand symbol isn't present. **Plus** a CI grep guard: `scripts/forbid-verbs.sh` greps `apps/ packages/ prompts/` for the forbidden vocabulary and fails the build.
**Warning signs:** PRs that touch the verdict type without touching `packages/shared`; presence of `as Verdict` anywhere outside the constructor.

### Pitfall 2: SameSite=Strict breaks Google OAuth callback

**What goes wrong:** Setting the access cookie to `SameSite=Strict` means the browser will NOT send it on the cross-site GET redirect from `accounts.google.com` back to `/auth/google/callback`. The callback handler completes, sets the cookie, redirects to `/app/dashboard` — and the dashboard sees no cookie because the redirect from Google was treated as cross-site by the browser when checking which cookies to send during the bounce.
**Why it happens:** "Strict is more secure" — true in isolation, false when the auth flow involves a cross-site redirect.
**How to avoid:** Access cookie = `SameSite=Lax`. Refresh cookie = `SameSite=Strict` AND `Path=/auth/refresh` (refresh is never the entry point of a cross-site nav, so Strict is safe and adds defense).
**Warning signs:** "OAuth works in dev (localhost-same-origin) but loops to /login in prod."

### Pitfall 3: Refresh tokens stored only as signed JWTs, no reuse detection

**What goes wrong:** Refresh token is "stateless" — signature valid means accepted. A phisher captures one refresh token. Both they and the legitimate user now refresh forever without detection.
**Why it happens:** "JWTs are stateless, that's the point." True for access tokens (short-lived). Refresh tokens must be revocable.
**How to avoid:** Store `sha256(refreshToken)` in Redis at `refresh:{userId}` with TTL = refresh lifetime. On `/auth/refresh`: verify signature, then `GET refresh:{userId}` and compare hashes. **Mismatch → reuse detected → DEL key → force re-login.** Match → mint new pair, store new hash, return.
**Warning signs:** No Redis keys under `refresh:*`; no session-revocation logic; logout doesn't invalidate refresh.

### Pitfall 4: bcrypt cost factor copy-pasted from a 2018 tutorial

**What goes wrong:** Cost factor 10 (or worse, 8) is set; hardware has moved; offline cracking is faster than intended.
**How to avoid:** Cost factor **12** for bcrypt as of OWASP 2026. Set it as a named constant `BCRYPT_ROUNDS = 12` in `auth.constants.ts`, referenced once in `auth.service.ts`. Periodically retune (every 18–24 months).
**Warning signs:** `await bcrypt.hash(pw, 10)` in code.

### Pitfall 5: Cache key with no TTL leaks memory forever

**What goes wrong:** Someone bypasses the facade and uses the raw `ioredis` client directly, or the facade exposes a `setForever()` method "just for sessions" that someone reuses elsewhere.
**How to avoid:**
- **Only `CacheService` is exported** from `cache.module.ts`. The raw `Redis` client is a private provider, not exported.
- `CacheService.set<T>(key, value, ttlSeconds: number)` — `ttlSeconds` is a required positional argument, no default.
- Central `ttl-policy.ts` constants: `TTL_AUTH_REFRESH = 7 * 24 * 3600`, `TTL_GEMINI_NARRATIVE = 24 * 3600`, etc. Use these constants, not magic numbers.
- Lint rule (eslint-plugin-boundaries or a custom rule) forbids importing `ioredis` outside `apps/api/src/modules/cache/**`.

**Warning signs:** `redis.set(...)` calls outside `cache.service.ts`; `EXPIRE` calls (means someone set a key without TTL and is patching it after).

### Pitfall 6: Secrets validated lazily, app boots fine then crashes at first request

**What goes wrong:** `process.env.GOOGLE_CLIENT_ID` is read inside `GoogleStrategy.constructor()`, which Nest doesn't instantiate until first request to `/auth/google`. The app deploys "successfully," then 503s the first OAuth attempt.
**How to avoid:** Zod schema validates all env at `ConfigModule.forRoot({ validate })`. The Nest app refuses to boot if anything is missing. **The deploy fails immediately**, not at user-facing 503.
**Warning signs:** Direct `process.env.X` reads scattered through the codebase. Use `configService.getOrThrow('X')`.

### Pitfall 7: Throttler with in-memory storage in a multi-instance deploy

**What goes wrong:** `@nestjs/throttler` defaults to in-memory storage. Behind a load balancer, an attacker just hits each instance N times to bypass rate limits.
**How to avoid:** Configure `ThrottlerStorageRedisService` (or equivalent) so limits are shared across instances. Single-instance Phase 1 dev works either way, but bake this in now — retrofitting is annoying.
**Warning signs:** `ThrottlerModule.forRoot({ ttl, limit })` with no `storage` option.

### Pitfall 8: Tailwind v3 setup pasted in (tailwind.config.js)

**What goes wrong:** Following an older shadcn tutorial → `tailwind.config.js` created → conflicts with v4's `@theme` directive → opaque build errors.
**How to avoid:** `pnpm dlx shadcn@latest init` on a fresh Next.js 15 app initializes v4 correctly. No `tailwind.config.js`. Theme tokens live in `globals.css` under `@theme { ... }`.
**Warning signs:** A `tailwind.config.{js,ts}` exists in `apps/web/`.

### Pitfall 9: `csurf` chosen because tutorials still reference it

**What goes wrong:** `csurf` is deprecated. Vulnerabilities aren't being patched.
**How to avoid:** Use `csrf-csrf 4.0.3`. Configure double-submit cookie pattern (sets a non-HttpOnly XSRF-TOKEN cookie; the frontend reads it and echoes via X-XSRF-TOKEN header on state-changing requests). Apply to all non-`GET`/`HEAD` routes except `/auth/google/callback` (Google's POST, not ours).
**Warning signs:** `import csurf from 'csurf'` in `main.ts`.

### Pitfall 10: Mongoose connection options drift between dev and prod

**What goes wrong:** Dev uses `mongodb://localhost:27017` with no auth; prod uses SRV string with TLS + retryable writes. Behavior differs.
**How to avoid:** Same `MONGO_URI` env var in both; Atlas SRV string in prod, Docker Compose Mongo (with auth + replica set so transactions and time-series work) in dev. Local Mongo MUST be a replica set (single-node `rs.initiate()` is enough) because the rest of the project will use multi-doc transactions and time-series collections.

## Code Examples

> Patterns verified against official NestJS 11 + Passport docs + ioredis 5 docs + Mongoose 9 docs.

### `packages/shared/src/verdict.ts` — Branded Verdict (COMP-01)

```ts
// Source: TypeScript branded-type pattern (Effect, Zod, Drizzle all use it)
declare const verdictBrand: unique symbol;

export type Verdict = string & { readonly [verdictBrand]: true };

const ALLOWED = ['STRONG_SCORE', 'CAUTION', 'WEAK_SCORE'] as const;
type VerdictLiteral = (typeof ALLOWED)[number];

export function makeVerdict(value: VerdictLiteral): Verdict {
  if (!ALLOWED.includes(value)) {
    // Defense in depth — exhaustiveness check at type level already covers this.
    throw new Error(`Invalid verdict: ${value}`);
  }
  return value as unknown as Verdict;
}

// Type-level guard helper
export function isVerdict(v: unknown): v is Verdict {
  return typeof v === 'string' && (ALLOWED as readonly string[]).includes(v);
}

export const VERDICTS = {
  STRONG_SCORE: makeVerdict('STRONG_SCORE'),
  CAUTION:      makeVerdict('CAUTION'),
  WEAK_SCORE:   makeVerdict('WEAK_SCORE'),
} as const;
```

```ts
// CONSUMER — type-safe construction site
import { makeVerdict, type Verdict } from '@finsight/shared';

const v: Verdict = makeVerdict('STRONG_SCORE');     // OK
const bad: Verdict = makeVerdict('BUY');            // TYPE ERROR — 'BUY' not in VerdictLiteral
const cast: Verdict = 'BUY' as unknown as Verdict;  // possible but grep-detectable in CI
```

### `apps/api/src/config/env.schema.ts` — Boot-Time Validation (FOUND-04)

```ts
// Source: zod 4.4.3 + @nestjs/config 4.0.4 official docs
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
  PORT: z.coerce.number().int().positive().default(3001),

  // Mongo
  MONGO_URI: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(7 * 24 * 3600),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),

  // Gemini (used Phase 4+, but validated at boot now)
  GEMINI_API_KEY: z.string().min(1),

  // Cookie / CSRF
  COOKIE_DOMAIN: z.string().min(1),
  COOKIE_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;
```

```ts
// apps/api/src/config/config.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { envSchema } from './env.schema';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (raw) => envSchema.parse(raw), // throws → app refuses to boot
    }),
  ],
})
export class ConfigModule {}
```

### `apps/api/src/modules/cache/cache.service.ts` — Required-TTL Facade (FOUND-05)

```ts
// Source: ioredis 5.11.0 official docs
import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './cache.constants';

@Injectable()
export class CacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Set a cache key. ttlSeconds is REQUIRED — this is the FOUND-05 invariant.
   * Use constants from `./ttl-policy.ts`, never magic numbers at call sites.
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error(`CacheService.set: ttlSeconds must be > 0 (got ${ttlSeconds})`);
    }
    const payload = JSON.stringify(value);
    await this.redis.set(key, payload, 'EX', ttlSeconds);
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
  ): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const fresh = await producer();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }
}
```

```ts
// apps/api/src/modules/cache/ttl-policy.ts
// Central TTL table — every cache key references a named constant here.
export const TTL = {
  AUTH_REFRESH_HASH: 7 * 24 * 3600,      // 7 days, matches refresh JWT
  GEMINI_NARRATIVE: 24 * 3600,           // 24h per PROJECT.md
  GEMINI_CONTEXT_LONG: 7 * 24 * 3600,    // 7d per PROJECT.md
  PRICE_QUOTE: 60,                       // 1m (Phase 2)
  FUND_NAV_DAY: 24 * 3600,
} as const;
```

```ts
// apps/api/src/modules/cache/cache.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './cache.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) =>
        new Redis(cfg.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
        }),
    },
    CacheService,
  ],
  exports: [CacheService], // NOTE: REDIS_CLIENT is NOT exported — facade only.
})
export class CacheModule {}
```

### `apps/api/src/modules/health/redis.health.ts` — Custom Indicator (FOUND-02)

```ts
// Source: @nestjs/terminus 11.1.1 custom-indicator pattern
import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../cache/cache.constants';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  async ping(key = 'redis'): Promise<HealthIndicatorResult> {
    try {
      const pong = await this.redis.ping();
      const ok = pong === 'PONG';
      const result = this.getStatus(key, ok, { pong });
      if (!ok) throw new HealthCheckError('Redis ping failed', result);
      return result;
    } catch (err) {
      throw new HealthCheckError('Redis unreachable', this.getStatus(key, false, {
        error: err instanceof Error ? err.message : 'unknown',
      }));
    }
  }
}
```

```ts
// apps/api/src/modules/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MongooseHealthIndicator } from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { RedisHealthIndicator } from './redis.health';

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongo: MongooseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  // Liveness — process is up. No deps. Probes will not restart pods on Mongo blips.
  @Public()
  @Get('/health')
  liveness() {
    return { status: 'ok' };
  }

  // Readiness — Mongo + Redis must be healthy to serve traffic.
  @Public()
  @Get('/health/ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.mongo.pingCheck('mongo'),
      () => this.redis.ping('redis'),
    ]);
  }
}
```

### `apps/api/src/modules/auth/strategies/local.strategy.ts` + signup flow (AUTH-01)

```ts
// Source: @nestjs/passport 11 + passport-local docs
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const user = await this.authService.validateEmailPassword(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return user; // attached as req.user
  }
}
```

```ts
// apps/api/src/modules/auth/auth.service.ts (excerpt)
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12; // OWASP 2026 baseline

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly consent: ConsentService,
  ) {}

  async signup(dto: SignupDto, ctx: { ip: string; userAgent: string }) {
    const exists = await this.users.findByEmail(dto.email);
    if (exists) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.users.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
      provider: 'local',
      emailVerified: false,
    });
    await this.consent.recordInitial(user._id, dto.consent, ctx);
    const tokens = await this.tokens.issueSession(user._id);
    return { user, tokens };
  }

  async validateEmailPassword(email: string, password: string) {
    const user = await this.users.findByEmailWithHash(email);
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }
}
```

### Setting + Reading the JWT Cookie (AUTH-02)

```ts
// apps/api/src/modules/auth/auth.controller.ts (excerpt)
import { Controller, Post, Body, Res, UseGuards, Req, HttpCode } from '@nestjs/common';
import { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly cfg: ConfigService) {}

  @Post('signup')
  async signup(@Body() dto: SignupDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.signup(dto, {
      ip: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
    });
    this.setAuthCookies(res, tokens);
    return { user: { id: user._id, email: user.email, name: user.name } };
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.issueSession(req.user._id);
    this.setAuthCookies(res, tokens);
    return { user: { id: req.user._id, email: req.user.email } };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const userId = req.user?._id;
    if (userId) await this.authService.revokeSession(userId);
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/auth/refresh' });
  }

  private setAuthCookies(res: Response, tokens: { access: string; refresh: string }) {
    const isProd = this.cfg.getOrThrow('NODE_ENV') === 'production';
    const domain = this.cfg.getOrThrow('COOKIE_DOMAIN');
    res.cookie('access_token', tokens.access, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      domain,
      maxAge: this.cfg.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS') * 1000,
    });
    res.cookie('refresh_token', tokens.refresh, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/auth/refresh',
      domain,
      maxAge: this.cfg.getOrThrow<number>('JWT_REFRESH_TTL_SECONDS') * 1000,
    });
  }
}
```

```ts
// apps/api/src/modules/auth/strategies/jwt.strategy.ts
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(cfg: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.access_token ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: cfg.getOrThrow('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string }) {
    return { id: payload.sub, email: payload.email };
  }
}
```

### Refresh Token Rotation with Reuse Detection (AUTH-02)

```ts
// apps/api/src/modules/auth/tokens/token.service.ts (sketch)
import { createHash } from 'node:crypto';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly cache: CacheService,
    private readonly cfg: ConfigService,
  ) {}

  async issueSession(userId: string) {
    const access = await this.jwt.signAsync(
      { sub: userId },
      { secret: this.cfg.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: '15m' },
    );
    const refresh = await this.jwt.signAsync(
      { sub: userId, type: 'refresh' },
      { secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: '7d' },
    );
    await this.cache.set(`refresh:${userId}`, this.hash(refresh), TTL.AUTH_REFRESH_HASH);
    return { access, refresh };
  }

  async rotate(refreshToken: string): Promise<{ access: string; refresh: string }> {
    const payload = await this.jwt.verifyAsync<{ sub: string; type: string }>(refreshToken, {
      secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
    });
    if (payload.type !== 'refresh') throw new UnauthorizedException();

    const stored = await this.cache.get<string>(`refresh:${payload.sub}`);
    const presented = this.hash(refreshToken);

    if (stored === null || stored !== presented) {
      // REUSE DETECTED — nuke session, force re-login on all devices for this user.
      await this.cache.del(`refresh:${payload.sub}`);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    return this.issueSession(payload.sub);
  }

  async revoke(userId: string) {
    await this.cache.del(`refresh:${userId}`);
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
```

### Google OAuth Strategy (AUTH-03)

```ts
// apps/api/src/modules/auth/strategies/google.strategy.ts
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(cfg: ConfigService) {
    super({
      clientID: cfg.getOrThrow('GOOGLE_CLIENT_ID'),
      clientSecret: cfg.getOrThrow('GOOGLE_CLIENT_SECRET'),
      callbackURL: cfg.getOrThrow('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  validate(_at: string, _rt: string, profile: any, done: VerifyCallback) {
    const email = profile.emails?.[0]?.value;
    const emailVerified = profile.emails?.[0]?.verified ?? false;
    if (!email || !emailVerified) return done(new Error('Google email not verified'), undefined);
    done(null, {
      provider: 'google',
      providerId: profile.id,
      email,
      name: profile.displayName,
      emailVerified: true,
    });
  }
}
```

```ts
// callback handler in auth.controller.ts
@UseGuards(AuthGuard('google'))
@Get('google')
googleStart() { /* Passport redirects to Google */ }

@UseGuards(AuthGuard('google'))
@Get('google/callback')
async googleCallback(@Req() req: Request, @Res() res: Response) {
  const { user, isNew, tokens } = await this.authService.findOrCreateGoogle(req.user as GoogleProfile, {
    ip: req.ip ?? '',
    userAgent: req.get('user-agent') ?? '',
  });
  this.setAuthCookies(res, tokens);
  res.redirect(isNew ? '/onboarding/welcome' : '/app');
}
```

### DPDP Consent Schema (AUTH-05)

```ts
// apps/api/src/modules/consent/consent.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'consent_records', timestamps: { createdAt: 'timestamp', updatedAt: false } })
export class ConsentRecord {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  consentVersion!: string; // semver of policy doc, e.g. '1.0.0'

  @Prop({ type: Object, required: true })
  granular!: { analytics: boolean; marketing: boolean; aiNarrative: boolean };

  @Prop({ required: true }) ip!: string;
  @Prop({ required: true }) userAgent!: string;
  @Prop({ required: true, type: Date, default: () => new Date() }) timestamp!: Date;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  supersedesId!: Types.ObjectId | null; // null = current; otherwise points at prior record

  @Prop({ enum: ['signup', 'settings', 'reconsent'], required: true })
  source!: 'signup' | 'settings' | 'reconsent';
}

export type ConsentRecordDoc = ConsentRecord & Document;
export const ConsentRecordSchema = SchemaFactory.createForClass(ConsentRecord);

// Compound index for "current consent per user" lookups
ConsentRecordSchema.index({ userId: 1, supersedesId: 1 });
```

### `turbo.json` + Workspace Setup (FOUND-01, FOUND-03)

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": { "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "type-check": { "dependsOn": ["^build"], "outputs": [] }
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

```json
// tsconfig.base.json (root)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": {
      "@finsight/shared": ["packages/shared/src/index.ts"],
      "@finsight/shared/*": ["packages/shared/src/*"]
    }
  }
}
```

### Forbidden-Verbs CI Guard (COMP-01)

```bash
#!/usr/bin/env bash
# scripts/forbid-verbs.sh — wire into CI before tests run.
set -euo pipefail
PATTERN='\b(BUY|SELL|HOLD|recommend|recommended|target price|you should invest|guaranteed return)\b'
EXCLUDE='--glob !**/dist/** --glob !**/.next/** --glob !**/node_modules/** --glob !scripts/forbid-verbs.sh --glob !**/RESEARCH.md --glob !**/PITFALLS.md --glob !**/PROJECT.md --glob !**/CLAUDE.md'

if rg -wn $EXCLUDE "$PATTERN" apps packages prompts 2>/dev/null; then
  echo "✗ Forbidden compliance verbs found above (COMP-01)." >&2
  exit 1
fi
echo "✓ No forbidden verbs."
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `csurf` middleware | `csrf-csrf 4.0.3` | csurf deprecated 2022; alternatives matured | Cookie-based auth needs CSRF; pick the maintained one |
| JWT in `Authorization: Bearer` header + `localStorage` | JWT in `HttpOnly Secure` cookies | OWASP guidance + universal XSS reality | localStorage tokens are XSS-stealable |
| bcrypt cost 10 | bcrypt cost 12 | OWASP 2026 baseline | Slows attacker more than user |
| `tailwind.config.js` with `content: [...]` | Tailwind v4 CSS-first (`@theme` in globals.css) | Tailwind v4 GA | Zero-config content detection, faster builds |
| `@nestjs/bull` + `bull` | `@nestjs/bullmq` + `bullmq` | bull is maintenance-only | Better types, flow producers, cron via repeatable jobs |
| `@google/generative-ai` | `@google/genai` 2.6 | `generative-ai` deprecated 2025 | Phase 4+, but pre-pinned now |

**Deprecated / outdated to actively avoid:**
- `csurf` — deprecated, use `csrf-csrf`
- `@nestjs/bull` — legacy v3, use `@nestjs/bullmq`
- `tailwind.config.js` v3 style — Tailwind v4 is CSS-first
- `text-embedding-004` — sunset Jan 14 2026
- `@google/generative-ai` — frozen at 0.24.1

## Runtime State Inventory

Not applicable — this is a **greenfield** phase (no existing project state to migrate). Skipped per the agent's instructions for rename/refactor phases only.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js ≥ 20 | Next.js 15 + NestJS 11 + Turborepo | ✓ | v24.14.0 | — |
| pnpm ≥ 9 | Workspace package management | ✓ | 10.28.2 | — |
| npm | (interop) | ✓ | 10.9.7 | — |
| Docker | Local Mongo + Redis via docker-compose | ✓ | 29.1.3 | Run Mongo/Redis natively (more setup; not recommended) |
| Git | Version control | ✓ | 2.50.1 | — |
| redis-cli | Local debugging | ✓ | 8.6.1 | Use Docker `docker exec -it redis redis-cli` |
| mongosh | Local Mongo shell debugging | ✗ | — | `docker exec -it mongo mongosh` — fine |
| MongoDB Atlas account + M10 cluster in ap-south-1 | FOUND-02 (managed primary store) | UNVERIFIED | — | Local Docker Mongo with replica set covers Phase 1 dev; Atlas required by Phase 5/6 (Search + Vector Search) |
| Google Cloud Console project + OAuth 2.0 Client ID | AUTH-03 | UNVERIFIED | — | None — required; Phase 1 needs the client ID + secret + authorized redirect URI configured before AUTH-03 can be tested |
| Doppler CLI (or chosen secret manager) | FOUND-04 dev workflow | UNVERIFIED | — | `.env.local` file (gitignored) is acceptable for dev as long as prod uses GCP/AWS Secret Manager |

**Missing dependencies with no fallback:**
- **Atlas M10 cluster in ap-south-1** — must be provisioned before FOUND-02 can be marked complete. Local Docker Mongo is acceptable for the dev portion of Phase 1 (signup/login/health work without Atlas) but the "API connects to MongoDB Atlas" success criterion requires a real cluster.
- **Google OAuth client credentials** — must be created in Google Cloud Console with authorized redirect URI `http://localhost:3001/auth/google/callback` (dev) + the prod equivalent.

**Missing dependencies with viable fallback:**
- `mongosh` — Docker exec into the Mongo container.
- Doppler — `.env.local` (gitignored).

## Validation Architecture

Phase 1 uses Vitest on both sides of the monorepo (single test UX). NestJS's bundled Jest is fine but mixing two test runners in one monorepo adds friction; Vitest covers both adequately and `@nestjs/testing` integrates cleanly with it.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (web + api + shared) |
| API test config | `apps/api/vitest.config.ts` (Node env, `globals: true`, `setupFiles: ['./test/setup.ts']`) |
| Web test config | `apps/web/vitest.config.ts` (jsdom env for component tests, Node env for route handlers) |
| Shared package config | `packages/shared/vitest.config.ts` (Node env, type-tests via `expectTypeOf`) |
| Quick run command | `pnpm -F @finsight/api test -- --run --reporter=dot` |
| Full suite command | `pnpm turbo run test --filter=...` (runs `test` task across all workspaces with Turborepo caching) |
| Type-check command | `pnpm turbo run type-check` |
| Coverage | `--coverage` on Vitest → `coverage/` per package; aim for ≥ 80% (platform rule) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | `turbo run build` succeeds from clean checkout; web can `fetch()` API and parse a typed response | smoke + e2e | `pnpm turbo run build && pnpm --filter @finsight/api test -- foundation.e2e-spec.ts` | ❌ Wave 0 |
| FOUND-02 | `GET /health` returns 200 always; `GET /health/ready` returns 200 only when Mongo + Redis are up; returns 503 when Redis is killed | integration | `pnpm --filter @finsight/api test -- health.e2e-spec.ts` | ❌ Wave 0 |
| FOUND-03 | A `@finsight/shared` DTO imported in both `apps/api` and `apps/web` resolves to the same type | type | `pnpm turbo run type-check` + `packages/shared/test/exports.test-d.ts` | ❌ Wave 0 |
| FOUND-04 | App refuses to boot when `MONGO_URI` is missing or malformed; logs which fields failed | unit | `pnpm --filter @finsight/api test -- config/env.schema.spec.ts` | ❌ Wave 0 |
| FOUND-05 | `CacheService.set(key, value)` (no TTL) is a TYPE ERROR; runtime call with `ttlSeconds=0` throws | unit + type | `pnpm --filter @finsight/api test -- cache/cache.service.spec.ts` + `cache.service.test-d.ts` | ❌ Wave 0 |
| AUTH-01 | POST `/auth/signup` with valid DTO creates user, hashes password with bcrypt 12, returns user + sets cookies | e2e | `pnpm --filter @finsight/api test -- auth.signup.e2e-spec.ts` | ❌ Wave 0 |
| AUTH-02 | POST `/auth/login` issues access + refresh cookies; subsequent GET `/auth/me` with cookie returns user; expired access + valid refresh on `/auth/refresh` mints new pair; second use of old refresh revokes session | e2e | `pnpm --filter @finsight/api test -- auth.session.e2e-spec.ts` | ❌ Wave 0 |
| AUTH-03 | GET `/auth/google/callback` with mocked Google profile creates user + consent + cookies; existing user reuses record | e2e (with mocked Google) | `pnpm --filter @finsight/api test -- auth.google.e2e-spec.ts` | ❌ Wave 0 |
| AUTH-04 | POST `/auth/logout` clears both cookies + DELs `refresh:{userId}`; subsequent `/auth/refresh` is rejected | e2e | `pnpm --filter @finsight/api test -- auth.logout.e2e-spec.ts` | ❌ Wave 0 |
| AUTH-05 | Signup writes a ConsentRecord with all fields populated; revoke writes a NEW record with supersedesId pointing at prior; "current consent" query returns the new one | unit + integration | `pnpm --filter @finsight/api test -- consent/consent.service.spec.ts` | ❌ Wave 0 |
| COMP-01 | `makeVerdict('BUY')` is a TYPE ERROR; `as Verdict` cast is detected by `scripts/forbid-verbs.sh` and exits non-zero; `STRONG_SCORE`/`CAUTION`/`WEAK_SCORE` round-trip through Zod schemas in shared DTOs | unit + type + CI grep | `pnpm --filter @finsight/shared test -- verdict.spec.ts` + `bash scripts/forbid-verbs.sh` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm -F @finsight/api test -- --run --reporter=dot` (typically < 10s for the changed module's tests)
- **Per wave merge:** `pnpm turbo run test type-check lint` (full Vitest + tsc + ESLint across all workspaces) + `bash scripts/forbid-verbs.sh`
- **Phase gate:** Full suite green + `pnpm turbo run build` clean from a fresh `node_modules/`; manual smoke of the signup → login → OAuth → refresh → logout flow against a real Atlas dev cluster and a real Google OAuth dev client; before `/gsd-verify-work`.

### Wave 0 Gaps

All test infrastructure needs to be created — this is a greenfield phase. Wave 0 tasks must include:

- [ ] `vitest.config.ts` in each of `apps/api`, `apps/web`, `packages/shared` — framework install + base config
- [ ] `apps/api/test/setup.ts` — shared test fixtures (in-memory Mongo via `mongodb-memory-server`, real Redis via `ioredis-mock` or test container, `@nestjs/testing` `Test.createTestingModule` helpers)
- [ ] `apps/api/test/factories/user.factory.ts` — typed user factory
- [ ] `apps/api/test/google-oauth.mock.ts` — Passport `GoogleStrategy` mocked so callback tests don't hit Google
- [ ] `packages/shared/test/setup.ts` — type-test runner config
- [ ] `scripts/forbid-verbs.sh` (executable) — CI verb guard
- [ ] CI workflow (`.github/workflows/ci.yml` or equivalent) calling `pnpm turbo run lint type-check test build` + the verb guard
- [ ] Test envs: `apps/api/.env.test` with sane defaults for the Zod schema so tests boot

## Security Domain

`security_enforcement` is enabled (default). Phase 1 is auth + secrets + session — security is the centerpiece.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| **V2 Authentication** | yes | `bcrypt 6.0.0` cost factor 12 for passwords; `@nestjs/passport` + `passport-local` + `passport-google-oauth20`; password min-length 12 (per OWASP 2026) and complexity guard via `class-validator`; account-creation rate-limited via `@nestjs/throttler` (5/min/IP); email verification flag on user (real verification flow can land in a later phase, but the field exists from day one) |
| **V3 Session Management** | yes | `@nestjs/jwt 11.0.2` issues access (15 min) + refresh (7 d); access in `HttpOnly Secure SameSite=Lax` cookie; refresh in `HttpOnly Secure SameSite=Strict Path=/auth/refresh` cookie; refresh **rotated on every use** with reuse detection via Redis-stored sha256 hash; logout DELs the Redis hash |
| **V4 Access Control** | partial | Phase 1 has only "authenticated user" tier — no roles yet. `JwtAuthGuard` applied globally via `APP_GUARD`; `@Public()` decorator opts public routes out. Object-level access control deferred to Phase 4+ (when watchlists / reports exist with user-owned data). |
| **V5 Input Validation** | yes | Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`; `zod 4.4.3` schemas in `packages/shared` for DTOs consumed by both apps; `nestjs-zod 5.4.0` bridges Zod schemas into Nest's pipe system; raw `unknown` only at the boundary, parsed immediately |
| **V6 Cryptography** | yes | All hashing via `bcrypt` (passwords) or `crypto.createHash('sha256')` (refresh-token storage); JWT secrets ≥ 32 chars enforced by Zod env schema; cookies signed with `cookie-parser`'s signing using `COOKIE_SECRET`; CSRF via `csrf-csrf 4.0.3` double-submit; **NEVER hand-roll crypto** |
| V7 Error Handling | yes | Global `AllExceptionsFilter` returns sanitized JSON `{ error: { code, message } }`; stack traces never sent to client (platform rule); errors logged server-side with structured fields (excluding PII) |
| V8 Data Protection | yes | DPDP-minimised user record (email, name, passwordHash, provider, emailVerified, timestamps — no PII beyond what's needed); consent record immutable + chained; planned soft-delete + export endpoints for DPDP Phase 3 (May 2027) |
| V9 Communications | yes | TLS everywhere in prod; HSTS via `helmet`; `Secure` cookie flag in prod; Atlas connection over TLS by default |
| V11 Business Logic | partial | Anti-automation on auth endpoints via Throttler; bot/abuse detection deferred |
| V13 API & Web Service | yes | DTOs validated, response shapes typed via shared Zod schemas, OpenAPI doc generated via `@nestjs/swagger` (optional) |
| V14 Configuration | yes | Helmet defaults applied; Zod env validation at boot; no debug/dev modes leak into prod; secrets sourced from Doppler/GCP Secret Manager |

### Known Threat Patterns for this Stack (Phase 1)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credential stuffing on `/auth/login` | Spoofing | `@nestjs/throttler` 5 req/min/IP on `/auth/*`; account lockout after N failed attempts (deferred to Phase 1 stretch); bcrypt cost 12 |
| XSS exfiltrates JWT | Information Disclosure | `HttpOnly` cookies (script-inaccessible); `helmet` CSP; no `dangerouslySetInnerHTML` in Phase 1 UI |
| CSRF on state-changing endpoints | Tampering | `csrf-csrf 4.0.3` double-submit cookie pattern on all non-GET/HEAD routes except `/auth/google/callback` |
| OAuth redirect URI tampering | Tampering / Spoofing | Strict allow-list of redirect URIs in Google Cloud Console; `state` parameter validated by `passport-google-oauth20` (built-in) |
| Refresh-token theft | Spoofing | Rotation on every use + sha256 hash stored in Redis + reuse detection → full session revocation |
| Session fixation | Spoofing | Always issue a fresh JWT on login/signup/OAuth (we do — never reuse a token) |
| JWT `alg: none` / alg-confusion attack | Tampering | `@nestjs/jwt` defaults to HS256; explicit `algorithms: ['HS256']` on verify |
| Secret in source / repo | Information Disclosure | Doppler (dev) / GCP Secret Manager (prod); Zod env schema; `.env.local` in `.gitignore`; pre-commit hook (gitleaks or similar — stretch) |
| Mongo NoSQL injection via crafted query objects | Tampering | Mongoose schema-typed queries + class-validator/Zod DTOs reject objects where strings are expected |
| Brute-force PII enumeration via login error messages | Information Disclosure | Identical error message for "wrong email" and "wrong password" — `Invalid credentials` |
| Open-redirect via `next` query param after login | Tampering | Server-side allow-list: redirect target must start with `/` and not `//` |
| Cookie misconfiguration leaks to non-app subdomains | Information Disclosure | `COOKIE_DOMAIN` set to exact app domain in prod, not a wildcard parent domain |
| Stack trace / framework version disclosure in error responses | Information Disclosure | `AllExceptionsFilter` returns `{ error: { code, message } }` only; `helmet.hidePoweredBy` (default) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Refresh tokens are in scope for v1 (rather than a single longer-lived access token) | § Standard Stack, § Architecture Patterns 4, § Code Examples (TokenService) | If user prefers simplicity, drop refresh entirely → single ~24h access cookie. Reduces ~2 days of work but trades off "user logged out unexpectedly" risk and lack of revocation. |
| A2 | bcrypt is acceptable; team does not require Argon2id | § Standard Stack, § Pitfall 4 | If Argon2id is required, swap library + tune memory/time/parallelism params. Same call sites. |
| A3 | Doppler (dev) + GCP Secret Manager (prod) is the secrets pick | § Standard Stack, § Don't Hand-Roll | If team prefers AWS Secrets Manager / 1Password / Infisical, swap the dev CLI and prod adapter — Nest ConfigModule pulls from `process.env` either way. Zero code change beyond ops. |
| A4 | Atlas M10 in ap-south-1 is acceptable cost (~$57/mo as of 2025 list price) | § Alternatives Considered, § Environment Availability | If cost-sensitive for v1, M0 free tier works for everything in Phase 1; tier migration before Phase 5 (Atlas Search). Documented as alternative. |
| A5 | DPDP consent policy doc exists (or will exist) at version 1.0.0 by Phase 1 completion | § Pattern 6, § Code Examples (ConsentRecord) | If no policy doc, granular flags + record shape still work; `consentVersion` just becomes `'draft-2026-05'` until the doc lands. Schema is forward-compatible. |
| A6 | Email verification is captured as a field (`emailVerified: boolean`) in Phase 1 but the actual verification email flow lands in a later phase | § ASVS V2, § Code Examples (AuthService.signup) | If verification flow is required in Phase 1, add 1 day for email-template + SES/SendGrid/Resend integration + verify route. |
| A7 | Vitest on both sides is acceptable (NestJS default Jest is fine but Vitest unifies) | § Validation Architecture | If the team wants Jest in api/, use Jest there and Vitest in web/ + shared/. Slight UX cost, no functional difference. |
| A8 | OWASP 2026 password-strength baseline (min length 12, no max, no forced complexity beyond rejecting top common passwords) | § ASVS V2 | If org policy requires the older "8 chars + uppercase + digit + symbol" pattern, swap the Zod regex. |

## Open Questions

1. **Refresh tokens or stateless 24h access?**
   - What we know: Spec doesn't say; refresh adds complexity (rotation, reuse detection, Redis key, extra endpoint).
   - What's unclear: Tolerance for "user got logged out" UX vs implementation cost.
   - Recommendation: Default to refresh-with-rotation (current research assumption). If asked in discuss-phase, surface as a simplify-or-keep choice. Implementation deltas isolated to `TokenService`.

2. **Email verification flow in Phase 1?**
   - What we know: Field `emailVerified: boolean` exists; SES/Resend/SendGrid integration is a day of work.
   - What's unclear: Whether AUTH-01/02 require a verified-email gate before login is allowed.
   - Recommendation: Capture the field now, defer the send/verify flow to Phase 1 stretch or Phase 2.

3. **Password reset / forgot-password in Phase 1?**
   - What we know: Not in the listed requirements (AUTH-01..05).
   - What's unclear: Whether marketing launch tolerates "no password reset."
   - Recommendation: Defer — it's missing from the phase reqs, don't expand scope.

4. **Cookie domain in prod (apex vs `app.` subdomain)?**
   - What we know: Affects whether the marketing landing (Phase 9) and the app share cookies.
   - What's unclear: Whether the marketing site needs read access to auth state (e.g., "Hi {name}" CTA when logged in).
   - Recommendation: Default `COOKIE_DOMAIN=app.finsight.in` (no sharing with marketing apex). Revisit in Phase 9 if the marketing CTA needs personalization.

5. **CI provider?**
   - What we know: Not stated. GitHub Actions is the obvious default.
   - What's unclear: Org-wide tooling.
   - Recommendation: GitHub Actions; the `pnpm turbo run` commands are CI-agnostic anyway.

## Sources

### Primary (HIGH confidence)
- **npm registry** (live, 2026-05-28) — `@nestjs/throttler@6.5.0`, `@nestjs/terminus@11.1.1`, `@nestjs/config@4.0.4`, `@nestjs/jwt@11.0.2`, `@nestjs/passport@11.0.5`, `bcrypt@6.0.0`, `argon2@0.44.0`, `ioredis@5.11.0`, `cache-manager@7.2.8`, `@nestjs/cache-manager@3.1.2`, `nestjs-zod@5.4.0`, `zod@4.4.3`, `helmet@8.2.0`, `csrf-csrf@4.0.3`, `cookie-parser@1.4.7`, `turbo@2.9.15`
- **`.planning/research/STACK.md`** (project) — locked stack, version pins for the broader app
- **`.planning/research/PITFALLS.md`** (project) — compliance + SameSite + JWT-cookie posture; reconciled in this document
- **`.planning/research/SUMMARY.md`** — non-negotiable invariants (verdict enum, secret manager, cache TTL)
- **`.planning/PROJECT.md` / `.planning/REQUIREMENTS.md` / `.planning/ROADMAP.md`** — phase scope + REQ-IDs
- **NestJS 11 official docs** — `docs.nestjs.com` (Authentication, Passport, JWT, ConfigModule, Throttler, Terminus, Mongoose, Validation, Interceptors) — patterns mirrored in code examples
- **OWASP ASVS v4.0.3 + OWASP Top 10 2021** — V2/V3/V5/V6 controls
- **OWASP Password Storage Cheat Sheet (2026 update)** — bcrypt cost factor 12 baseline
- **Tailwind CSS v4 official docs** — `@theme` directive, no `tailwind.config.js`
- **shadcn/ui official docs** — current CLI initializes Tailwind v4 + React 19
- **MongoDB Atlas docs** — M10 tier required for Atlas Search + Vector Search; ap-south-1 (Mumbai) region
- **DPDP Rules 2025 (PIB Gazette)** — consent record requirements (cited in PITFALLS.md)

### Secondary (MEDIUM confidence)
- **csrf-csrf** docs (npmjs.com) — double-submit cookie pattern
- **`@songkeys/nestjs-redis-health`** — community Terminus indicator, listed as optional alternative
- **`mongodb-memory-server`** — common test fixture pattern for Mongo unit/integration tests (not yet pinned; pin at Wave 0)

### Tertiary (LOW confidence)
- None for this phase — every claim is library-doc-backed or registry-verified.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions npm-verified 2026-05-28, locked-stack alignment confirmed
- Architecture: HIGH — patterns from official NestJS 11 docs + OWASP 2026 + project invariants in SUMMARY.md
- Pitfalls: HIGH — derived from official deprecation notices (csurf, cache-manager TTL semantics) + project PITFALLS.md (compliance verbs, SameSite, JWT storage) + reconciled where they conflicted (Strict→Lax for access cookie with clear rationale)
- Auth posture: HIGH — well-trodden NestJS pattern (Passport strategies + JWT module + global guard) with refresh-rotation pattern from OWASP cheat sheets

**Research date:** 2026-05-28
**Valid until:** 2026-06-27 (30 days — stable ecosystem, no expected upheaval); recheck `bcrypt`, `helmet`, and `csrf-csrf` versions if planning slips past that date.
