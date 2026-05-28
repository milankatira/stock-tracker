import { Injectable } from "@nestjs/common";
import { FundsRepository } from "./funds.repository";
import { InstrumentsRepository } from "./instruments.repository";
import type { FundRecord } from "./fund.schema";
import type { InstrumentRecord } from "./instrument.schema";

const ISIN_PATTERN = /^IN[A-Z0-9]{10}$/i;
const BSE_CODE_PATTERN = /^\d+$/;
const YAHOO_SUFFIX_PATTERN = /\.(NS|BO)$/i;

/**
 * Cross-symbol lookup for the instrument master.
 *
 * `resolveInstrument(query)` accepts the raw forms users type or
 * downstream code passes in (`'RELIANCE'`, `'reliance'`, `'500325'`,
 * `'RELIANCE.NS'`, `'INE002A01018'`) and resolves them to the SAME
 * canonical document. Case-insensitive via the schema-level collation.
 */
@Injectable()
export class LookupService {
  constructor(
    private readonly instruments: InstrumentsRepository,
    private readonly funds: FundsRepository,
  ) {}

  lookupByNseSymbol(symbol: string): Promise<InstrumentRecord | null> {
    return this.instruments.findByNseSymbol(symbol);
  }

  lookupByYahooSymbol(symbol: string): Promise<InstrumentRecord | null> {
    return this.instruments.findByYahooSymbol(symbol);
  }

  lookupByBseCode(code: string): Promise<InstrumentRecord | null> {
    return this.instruments.findByBseCode(code);
  }

  lookupByIsin(isin: string): Promise<InstrumentRecord | null> {
    return this.instruments.findByIsin(isin.toUpperCase());
  }

  lookupFundBySchemeCode(schemeCode: string): Promise<FundRecord | null> {
    return this.funds.findBySchemeCode(schemeCode);
  }

  async resolveInstrument(rawQuery: string): Promise<InstrumentRecord | null> {
    const query = rawQuery.trim();
    if (query.length === 0) return null;

    if (ISIN_PATTERN.test(query)) {
      return this.lookupByIsin(query);
    }
    if (BSE_CODE_PATTERN.test(query)) {
      const byBse = await this.lookupByBseCode(query);
      if (byBse) return byBse;
      return this.lookupByNseSymbol(query);
    }
    if (YAHOO_SUFFIX_PATTERN.test(query)) {
      const byYahoo = await this.lookupByYahooSymbol(query);
      if (byYahoo) return byYahoo;
      const nseEquivalent = query.replace(YAHOO_SUFFIX_PATTERN, "");
      return this.lookupByNseSymbol(nseEquivalent);
    }
    return this.lookupByNseSymbol(query);
  }
}
