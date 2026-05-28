import { Injectable, Logger } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import type { InstrumentSeedInput } from "../instruments.repository";

interface NseBhavRow {
  readonly SYMBOL: string;
  readonly SERIES: string;
  readonly ISIN?: string;
  readonly NAME?: string;
}

/**
 * Parser for the NSE daily bhav copy CSV. The full file ships with
 * SYMBOL, SERIES, OHLC, volume, TIMESTAMP, and ISIN columns; we only
 * carry forward the identity fields the instrument master needs.
 * Restricted to `SERIES='EQ'` rows (RESEARCH.md says ETFs, debt, and
 * derivatives use different series and shouldn't appear in the equity
 * instrument master).
 */
@Injectable()
export class NseBhavcopySeed {
  private readonly logger = new Logger(NseBhavcopySeed.name);

  parse(body: string): readonly InstrumentSeedInput[] {
    const rows = parse(body, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as readonly NseBhavRow[];

    const seeds: InstrumentSeedInput[] = [];
    let skipped = 0;
    for (const row of rows) {
      if (!row.SYMBOL || row.SERIES !== "EQ") {
        skipped += 1;
        continue;
      }
      const symbol = row.SYMBOL.trim().toUpperCase();
      seeds.push({
        nseSymbol: symbol,
        yahooSymbol: `${symbol}.NS`,
        name: (row.NAME ?? symbol).trim(),
        primaryExchange: "NSE",
        isin: row.ISIN?.trim() || undefined,
      });
    }
    this.logger.log(
      { provider: "nse-bhavcopy", accepted: seeds.length, skipped },
      "nse_bhavcopy_parsed",
    );
    return seeds;
  }
}
