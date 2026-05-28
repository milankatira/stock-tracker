---
phase: 03-scoring-engine-nightly-recompute
plan: 02
slug: pure-fund-scoring-engine
date: 2026-05-28
status: complete
deviations:
  - "5 fund fixtures (DIRECT/GROWTH only) instead of more — adequate to lock the snapshot stability + cover the partial-history (5Y absent) path. Adding more fixtures is a fixture-only follow-up."
  - "Property-test runs reduced from fast-check's default 100 to 50 per property for CI wall-clock — same trade-off as Plan 03-01."
  - "Plan 03-01 already owns `apps/api/src/scoring/types.ts`; fund-specific types live in `apps/api/src/scoring/fund/types.ts` and are re-exported from `apps/api/src/scoring/index.ts` (no edits required to `types.ts`, no merge handshake needed)."
  - "Used Nest built-in test stack (vitest + the shared snapshot serialiser) — no new tooling installed beyond fast-check already present from 03-01."
---

## What landed

### Re-exports (single config point)

- `apps/api/src/scoring/fund/decimal.ts` — re-exports the configured `Decimal` from `../stock/decimal.ts` (side-effect-import order guarantees the shared `ROUND_HALF_UP` config applies before any fund pillar arithmetic).
- `apps/api/src/scoring/fund/normalise.ts` — re-exports `percentileRank` / `absoluteBand` / `normaliseSubFactor` from the stock module.
- `apps/api/src/scoring/fund/compose.ts` — re-exports `toVerdict` + `clampAndRoundFinal`. Verdict bands are immutable between stock + fund.

### Fund-specific types + math

- `apps/api/src/scoring/fund/types.ts` — `ScoreFundInput` with `planType: 'DIRECT'` + `option: 'GROWTH'` as literal types (v1 contract). Carries the 60-month return series + risk-free rate + benchmark + category-median series + costs + manager + portfolio inputs + peer cohort.
- `apps/api/src/scoring/fund/returns-math.ts` — `meanReturn`, `stdDev` (sample, n-1), `downsideStdDev`, `sharpeRatio` (annualised, `null` on length < 12 or zero excess stddev), `sortinoRatio` (`null` when no downside months), `downsideCaptureRatio` (`null` when no negative benchmark months), `quartileStability` (boolean window list → 0..10).
- All math returns `Decimal` at 4 dp HALF_UP; rejects non-finite inputs by returning `null` from the high-level helpers.

### 6 fund pillars (`apps/api/src/scoring/fund/pillars/`)

| Pillar | Weight | Sub-factors |
|--------|-------:|-------------|
| `returns.ts` | 0.35 | `fundExcess3yVsBenchmark` (0.30), `fundExcess3yVsCategory` (0.20), `fundExcess5yVsBenchmark` (0.30), `fundExcess5yVsCategory` (0.20). Sub-factor absent when either source CAGR is `null`. |
| `risk-adjusted.ts` | 0.25 | `sharpe3y` (0.50), `sortino3y` (0.50). Either becomes `isAbsent` when the math returns `null` (insufficient data, zero stddev). |
| `consistency.ts` | 0.15 | `quartileStability` (0.60) — rolling 12-month wins vs category median; `downsideCapture` (0.40) — fund vs benchmark on negative-benchmark months. |
| `costs.ts` | 0.10 | `expenseRatio` (1.00). Whole-pillar fallback to 5.0 when expense ratio is `null`. |
| `manager.ts` | 0.10 | `currentManagerTenureYears` (0.50, absolute-band 1y/3y/5y), `managerMedianCagr3yExcess` (0.50, peer-percentile). |
| `portfolio.ts` | 0.05 | `top10HoldingsPctOfAum` (0.40), `sectorTiltAbsolutePct` (0.30), `annualTurnoverPct` (0.30). Lower is better on all three. |

Every band table is annotated `// [ASSUMED] A3 — RESEARCH.md`. The TRI/PRI contract is documented at the top of `returns.ts` (A9). The risk-free rate sourcing assumption is documented at the top of `risk-adjusted.ts` (A6).

### `scoreFund` entrypoint (`fund/score-fund.ts`)

- v1 runtime guard: `planType !== 'DIRECT' || option !== 'GROWTH'` → typed throw (A7). Verified by dedicated tests.
- Builds the six pillars in fixed canonical order: `[returns, risk-adjusted, consistency, costs, manager, portfolio]`.
- Reuses `clampAndRoundFinal` + `toVerdict` from the shared compose helpers.
- Stamps `scoringEngineVersion = SCORING_ENGINE_VERSION` on every result; Plan 03-03's `score_history` will persist this.

### Tests (apps/api/src/scoring/fund/__tests__/)

- `returns-math.spec.ts` — 18 unit tests covering empty/short inputs, length-mismatched series, zero-stddev short-circuit (returns `null`), no-downside short-circuit, quartile stability boundaries.
- `score-fund.spec.ts` — `describe.each` over 5 fixtures:
  - `_inputHash` matches a re-computed sha256 (canonical-json drift trip-wire).
  - Full `ScoreResult` snapshotted via `toMatchSnapshot()`; Decimal serialiser pins repr.
  - 6 pillars in canonical order; pillar weights sum to exactly `1.0000`.
  - Contributing sub-factor weights inside each non-fallback pillar sum to 1 within 4dp tolerance.
  - Sub-factor scores bounded to `[0, 10]`.
  - DIRECT/GROWTH guard verified by two negative tests (`planType: 'REGULAR'`, `option: 'IDCW'`).
- `score-fund.property.spec.ts` — fast-check property suite (50 runs per property): bounds, weighted-sum reconciliation, referential transparency on cloned input, pillar-weight invariant, input non-mutation.

### Fixtures (DIRECT/GROWTH only, A7 enforced at input shape)

- `HDFC_FLEXICAP_DIRECT_GROWTH.json` — 60-month flexicap with mid-cohort percentile.
- `PARAG_PARIKH_FLEXICAP_DIRECT_GROWTH.json` — outperforming flexicap (top of cohort).
- `AXIS_BLUECHIP_DIRECT_GROWTH.json` — laggard large-cap (below benchmark + higher expense).
- `MIRAE_LARGECAP_DIRECT_GROWTH.json` — 36-month large-cap (5Y CAGR `null` — exercises absent-sub-factor weight redistribution).
- `SBI_SMALLCAP_DIRECT_GROWTH.json` — small-cap (manager tenure 1.2y, higher turnover — exercises portfolio + manager bands).

Each fixture has a committed `_inputHash` (sha256 over canonical JSON minus the hash field itself).

## Cross-phase contracts emitted

- `scoreFund(input: ScoreFundInput): ScoreResult` is the single entry point. Plan 03-03 will wrap it in BullMQ alongside `scoreStock`.
- `ScoreResult.scoringEngineVersion` reuses the same `SCORING_ENGINE_VERSION = "0.1.0"` constant — bump on any output-affecting change to stock OR fund engines.
- DIRECT/GROWTH-only assumption (A7) is enforced both at the TypeScript shape level (`planType: 'DIRECT'` literal) and at runtime (`scoreFund` throws on any other combination).

## Verification (at commit time)

| Gate | Result |
|------|--------|
| `pnpm --filter @finsight/api test` | **347 pass** (58 files, up from 296) |
| `pnpm --filter @finsight/api test:e2e` | 16 pass (4 files) |
| `pnpm --filter @finsight/api type-check` | clean |
| `pnpm --filter @finsight/api lint` | clean |
| `pnpm --filter @finsight/api lint:arch` | clean |
| `pnpm --filter @finsight/web test` | 15 pass |
| `pnpm forbid-verbs` | clean |
| `git diff --check` | clean |
| Purity audit: `@nestjs / mongoose / ioredis / bullmq` in `apps/api/src/scoring/fund/**` | none |
| Sentinel test: non-DIRECT or non-GROWTH input | throws as expected |

## Open questions (carried forward, surface in `/gsd-discuss-phase`)

- **A6** — Risk-free rate = 10Y G-Sec monthly snapshot (RBI WSS). Documented at the top of `risk-adjusted.ts`.
- **A7** — DIRECT/GROWTH only in v1. Enforced at runtime + TypeScript shape; future Regular-plan / IDCW scoring would be a separate function (`scoreFundRegular`, `scoreFundIdcw`) to keep the v1 fixtures stable.
- **A9** — Phase 2 ingests TRI (not PRI) for benchmarks. Phase 2 owners must confirm.
- **A2 / A3** — Per-pillar sub-factor weights + absolute-band fallback thresholds. Annotated inline; cheap to retune without invalidating cross-phase contracts.

## What this plan still defers

- Plan 03-03 — BullMQ EOD recompute, `score_history` time-series collection, Redis `score:latest` / `score:prev` materialisation, admin recompute endpoint. Reads `scoreFund` + `scoreStock` from the index barrel.
- Expanding the fund fixture set (currently 5; the snapshot stability + absent-sub-factor + guard tests are already proven on these).
- Node 20 + Node 22 CI matrix workflow file.
- Real RBI WSS sourcing of `riskFreeRateMonthly` (Phase 2 loader contract).
- Monetary-policy benchmark adjustments — out of scope for v1.
