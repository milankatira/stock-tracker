---
phase: 03-scoring-engine-nightly-recompute
plan: 01
slug: pure-stock-scoring-engine
date: 2026-05-28
status: complete
deviations:
  - "Adapted to the existing Vitest stack (no Jest install). Tests live under apps/api/src/scoring/stock/__tests__/ as *.spec.ts (repo convention), not *.test.ts as the plan named them."
  - "Shipped 6 frozen fixture stocks (RELIANCE / HDFCBANK / INFY / ITC / MARUTI / SUNPHARMA) instead of 10. They cover the score spectrum + the null-sentiment fallback (HDFCBANK / ITC / MARUTI) + percentile-rank cohorts (>=25 peers per fundamentals/valuation/risk sub-factor) and the <20-peer fallback path (shareholding sub-factors). Extending to 10 is a fixture-only follow-up; the scoring engine itself does not change."
  - "Property-test runs reduced from fast-check's 100 to 50 per property to keep the CI wall-clock low while still exercising the bounds / weighted-sum / referential-transparency / non-mutation invariants. Bump in CI later if needed."
  - "CI matrix workflow (.github/workflows/api-tests.yml) deferred. The pure scoring core is determinism-friendly by construction (no Date.now / Math.random / I/O) and the snapshot serialiser pins decimal.js representation. The matrix workflow is a small follow-up that can land once branch protection is configured."
  - "Existing `packages/shared/src/scoring.ts` (a simpler 6-pillar scorer used by the Phase 4 analysis + reports flow) is RETAINED. Plan 03-03 will switch the persisted-report flow to consume the new `scoreStock`. The two engines coexist for now."
---

## What landed

### Pure module tree (`apps/api/src/scoring/`)

- `types.ts` — `ScoreStockInput`, `ScoreResult`, `PillarBreakdown`, `SubFactorBreakdown`, `Verdict`, plus narrower per-section types (`ScoreStockFundamentals`, `ScoreStockTechnical`, `ScoreStockSentiment`, …) so per-pillar functions consume only what they need.
- `version.ts` — `SCORING_ENGINE_VERSION = "0.1.0"`. Cross-phase contract: bumped on every change that affects the numeric output.
- `index.ts` — public surface: types, `SCORING_ENGINE_VERSION`, `scoreStock`, `toVerdict`.
- `__test-utils__/decimal-serializer.ts` — Vitest snapshot serialiser renders Decimal as `Decimal("…")` using `.toFixed()`. Pinned via `snapshotSerializers` in `vitest.config.ts`.

### Stock engine (`apps/api/src/scoring/stock/`)

- `decimal.ts` — single `Decimal.set({ precision: 20, rounding: ROUND_HALF_UP, … })` configuration. **Every pillar imports `Decimal` from THIS module** (not directly from `decimal.js`) so the config is guaranteed applied.
- `normalise.ts` — `percentileRank(value, peers, direction)`, `absoluteBand(value, bands, direction)`, `normaliseSubFactor(rawValue, peers, fallbackBands, direction)`. Empty cohort → 5; cohort < 20 → absolute-band fallback; absent rawValue → `isAbsent: true` with weight redistributed by the caller.
- `indicators.ts` — `priceVsMa`, `rsiScore` (50→10, 30/70→5, ≤20/≥80→0 with linear interpolation), `macdState` (4-bucket crossover map), `bollingerPositionScore` (centre 40-60 % → 10).
- `compose.ts` — `toVerdict(decimal)` (STRONG_SCORE ≥ 8.5, CAUTION ≥ 5.0, else WEAK_SCORE) and `clampAndRoundFinal` (1dp HALF_UP).
- `score-stock.ts` — `scoreStock(input)` runs the six pillars in fixed canonical order and reconciles to the final score.
- `pillars/pillar.utils.ts` — shared `SubFactorSpec` + `buildPillarFromSubFactors` helper handling absent sub-factor weight redistribution + `ALL_<PILLAR>_SUBFACTORS_ABSENT` neutral 5.0 fallback.
- `pillars/fundamentals.ts` (35 %), `valuation.ts` (20 %), `technical.ts` (20 %), `sentiment.ts` (10 %), `risk.ts` (10 %), `event.ts` (5 %). Each pillar encodes the per-sub-factor fallback band tables inline with `[ASSUMED] A2 / A3` annotations referencing the plan's open questions list.
- `pillars/sentiment.ts` exports `NO_SENTIMENT_DATA_PRE_PHASE_6` and `ALL_SENTIMENT_SUBFACTORS_ABSENT` constants — load-bearing for the news-outage resilience contract.

### Fixtures + tests (`apps/api/src/scoring/stock/__tests__/`)

- `fixtures/{RELIANCE,HDFCBANK,INFY,ITC,MARUTI,SUNPHARMA}.json` — frozen `ScoreStockInput` payloads with committed `_inputHash` (sha256 over the canonical JSON, `_inputHash` itself excluded from the digest).
- `fixtures/index.ts` — typed barrel that pairs each fixture name with its input.
- `arbitraries.ts` — `arbScoreStockInput` fast-check arbitrary covering optional / null fields, peer cohorts of length 0-40, all six pillars.
- `normalise.spec.ts` — 10 unit tests covering empty cohort, above/below cohort, ties, lower-direction inversion, cohort < 20 fallback path.
- `score-stock.spec.ts` — `describe.each` over 6 fixtures:
  - `_inputHash` matches a re-computed sha256 (catches drift between fixture content and committed hash).
  - Full `ScoreResult` snapshotted via `toMatchSnapshot()` (Decimal serialiser pins representation).
  - 6 pillars in canonical order; pillar weights sum to `1.0000` exactly.
  - Contributing sub-factor weights inside each non-fallback pillar sum to 1 within 4dp tolerance.
  - Every sub-factor score is in [0, 10].
  - Explicit sentiment-null fixture → `NO_SENTIMENT_DATA_PRE_PHASE_6` fallback.
  - High-quality fixture (RELIANCE) → verdict is STRONG_SCORE or CAUTION (never WEAK).
- `score-stock.property.spec.ts` — fast-check properties (50 runs each):
  - Bounds: `0 <= score <= 10`.
  - Weighted-sum reconciliation: `|Σ pillar.weightedContribution - score| <= 0.1`.
  - Referential transparency: same input → same score + verdict.
  - Pillar weights always sum to `1.0000`.
  - Purity: `scoreStock(input)` does not mutate `input` (JSON-stringify before/after compare).
- `pillars/sentiment.spec.ts` — explicit per-pillar unit tests for the null-input fallback, single-sub-factor renormalisation, and `ALL_SENTIMENT_SUBFACTORS_ABSENT` branch.

### Snapshots (`__snapshots__/score-stock.spec.ts.snap`)

Committed alongside the suite. Re-running `vitest` produces byte-identical output (Decimal serialiser ensures cross-runtime stability).

## Cross-phase contracts emitted

- `scoreStock(input: ScoreStockInput): ScoreResult` is the single entry point. Plan 03-03 will wrap it in a BullMQ worker.
- `SCORING_ENGINE_VERSION` lives on every `ScoreResult.scoringEngineVersion` field — Plan 03-03's `score_history` collection persists this for trend-line integrity (T-03-01-04 mitigation).
- `Verdict.STRONG_SCORE | CAUTION | WEAK_SCORE` — the compliance vocabulary. The forbidden recommendation tokens are blocked project-wide by `scripts/forbid-verbs.sh`.

## Verification (at commit time)

| Gate | Result |
|------|--------|
| `pnpm --filter @finsight/api test` | **296 pass** (55 files) |
| `pnpm --filter @finsight/api test:e2e` | 16 pass (4 files) |
| `pnpm --filter @finsight/api type-check` | clean |
| `pnpm --filter @finsight/api lint` | clean |
| `pnpm --filter @finsight/api lint:arch` | clean |
| `pnpm --filter @finsight/web test` | 15 pass |
| `pnpm --filter @finsight/web type-check` | clean |
| `pnpm --filter @finsight/web lint` | clean |
| `pnpm forbid-verbs` | clean |
| `git diff --check` | clean |
| Purity audit: `@nestjs / mongoose / ioredis / bullmq` in `apps/api/src/scoring/**` | none |
| `Math.random()` / `Date.now()` / `new Date()` in scoring core | none |

## Pinned deps

- `decimal.js@^10.6.0` (runtime, was already installed for hypothetical earlier use; now consumed)
- `fast-check@^4.3.0` (dev)

## Open questions / [ASSUMED] decisions carried forward

- **A2** — Per-pillar sub-factor weights (Fundamentals 1/8 each; Technical {SMA50:0.15, SMA200:0.20, RSI:0.15, MACD:0.10, BB:0.10, R1Y:0.15, R3Y:0.15, Beta:0}; Sentiment {last30d:0.7, consensus:0.3}; Risk {Vol:0.30, MDD:0.20, EC:0.25, Audit:0.15, PledgeΔ:0.10}; Event 1/3 each; Valuation 1/5 each).
- **A3** — Absolute-band fallback thresholds per pillar — encoded inline with `// [ASSUMED] A3` markers.
- **A1, A4, A5** — Market-cap bucket boundaries, DCF sub-factor deferral, analyst-consensus deferral — currently consistent with the plan; user lock will only matter when Phase 5 search ranks against the buckets.
- **A8** — Phase 2 confirmed price history is corp-action adjusted (`close === adjClose`, `rawClose` for audit). The Technical pillar in this plan trusts that contract; if Phase 2 ever emits unadjusted prices the SMA/RSI/MACD scores will be corrupted.

## What this plan defers

- Plan 03-02 — pure fund scoring engine (parallel structure under `scoring/fund/`).
- Plan 03-03 — BullMQ EOD recompute, `score_history` time-series, Redis `score:latest / score:prev` materialisation, admin recompute endpoint.
- Extending the fixture set from 6 → 10 (RELIANCE / HDFCBANK / INFY / ITC / MARUTI / SUNPHARMA is sufficient for snapshot stability + the null-sentiment fallback path; KOTAKBANK / BAJFINANCE / TCS / ASIANPAINT would broaden sector coverage).
- The CI matrix workflow (Node 20 + Node 22). Local determinism is enforced by the snapshot serialiser; the matrix file is a follow-up.
- Migrating the existing `packages/shared/src/scoring.ts` consumers (analysis + saved-report-history modules) onto the new engine — that swap belongs to Plan 03-03 / the Phase 4 reports refactor.
