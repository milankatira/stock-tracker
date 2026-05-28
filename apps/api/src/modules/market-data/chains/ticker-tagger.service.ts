import { Injectable, Logger } from "@nestjs/common";
import type { NewsItem } from "@finsight/shared";
import type { InstrumentRecord } from "../instruments/instrument.schema";
import { InstrumentsRepository } from "../instruments/instruments.repository";

export interface TaggedNewsItem {
  readonly news: NewsItem;
  readonly instrumentIds: readonly string[];
}

/**
 * Joins `NewsItem[]` to canonical instruments by matching name, NSE
 * symbol, and Yahoo symbol against the title + body of each item. Pure
 * domain logic: news adapters stay dumb, the instrument master stays in
 * the data layer, and Phase 6 sentiment can take this output without
 * needing to know either.
 */
@Injectable()
export class TickerTaggerService {
  private readonly logger = new Logger(TickerTaggerService.name);

  constructor(private readonly instruments: InstrumentsRepository) {}

  async tag(
    items: readonly NewsItem[],
  ): Promise<readonly TaggedNewsItem[]> {
    if (items.length === 0) return [];
    const tickers = await this.instruments.listActiveTickers();
    if (tickers.length === 0) return items.map((news) => ({ news, instrumentIds: [] }));

    const matchers = tickers.map((instrument) => ({
      instrumentId: instrument._id.toString(),
      patterns: this.patternsFor(instrument),
    }));

    return items.map((news) => {
      const haystack = `${news.title} ${news.body ?? ""}`;
      const matched = new Set<string>();
      for (const matcher of matchers) {
        if (matcher.patterns.some((pattern) => pattern.test(haystack))) {
          matched.add(matcher.instrumentId);
        }
      }
      return { news, instrumentIds: [...matched] };
    });
  }

  private patternsFor(instrument: InstrumentRecord): readonly RegExp[] {
    const patterns: RegExp[] = [];
    patterns.push(this.wordPattern(instrument.nseSymbol));
    if (instrument.yahooSymbol) {
      patterns.push(this.wordPattern(instrument.yahooSymbol));
    }
    if (instrument.name) {
      const firstToken = instrument.name.split(/\s+/, 1)[0];
      if (firstToken && firstToken.length >= 3) {
        patterns.push(this.wordPattern(firstToken));
      }
    }
    return patterns;
  }

  private wordPattern(value: string): RegExp {
    const escaped = value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i");
  }
}
