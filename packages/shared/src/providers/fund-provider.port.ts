import type { ProviderResult } from "./provider-result";

export interface NavSnapshot {
  readonly schemeCode: string;
  readonly nav: number;
  readonly date: Date;
}

export interface NavPoint {
  readonly ts: Date;
  readonly nav: number;
}

export interface SchemeMaster {
  readonly schemeCode: string;
  readonly schemeName: string;
  readonly isinGrowth: string | null;
  readonly isinReinvestment: string | null;
}

export interface FundProvider {
  getLatestNav(schemeCode: string): Promise<ProviderResult<NavSnapshot>>;
  getNavHistory(schemeCode: string): Promise<ProviderResult<NavPoint[]>>;
  listSchemes(): Promise<ProviderResult<SchemeMaster[]>>;
}

export const FUND_PROVIDER = Symbol("FUND_PROVIDER");
