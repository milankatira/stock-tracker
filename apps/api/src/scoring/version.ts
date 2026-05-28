/**
 * SemVer of the scoring engine. Bump on any change that affects the
 * numeric output of `scoreStock` or `scoreFund` (formula, weight,
 * fallback band). The CI snapshot suite is the trip-wire — any
 * regeneration of snapshots MUST be accompanied by a version bump.
 */
export const SCORING_ENGINE_VERSION = "0.1.0";
