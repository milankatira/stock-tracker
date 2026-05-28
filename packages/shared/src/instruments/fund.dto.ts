export type FundPlan = "DIRECT" | "REGULAR";
export type FundOption = "GROWTH" | "IDCW";

/**
 * Canonical wire shape for a single mutual fund. Mongo schema lives in
 * Plan 02-03.
 *
 * `popularity` (AUM in ₹ crore) drives Phase 5 search ranking — keep the
 * field present even when zero so the ranking pipeline never NPEs.
 */
export interface FundDto {
  readonly id: string;
  /** AMFI scheme code — string because leading zeros are significant. */
  readonly schemeCode: string;
  readonly isin?: string;
  readonly amcCode: string;
  readonly name: string;
  readonly plan: FundPlan;
  readonly option: FundOption;
  readonly category: string;
  readonly benchmark?: string;
  readonly popularity: number;
  readonly isActive: boolean;
  readonly dataVersionHash: string;
}
