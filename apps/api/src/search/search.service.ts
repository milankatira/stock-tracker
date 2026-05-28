import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type {
  InstrumentMatch,
  InstrumentMatchType,
} from "@finsight/shared";
import {
  Instrument,
  type InstrumentDocument,
} from "../modules/market-data/instruments/instrument.schema";
import {
  FundReportDocEntity,
  type FundReportDocDocument,
} from "../reports/schemas/fund-report-doc.schema";

interface SearchOptions {
  readonly limit?: number;
  readonly type?: InstrumentMatchType;
}

const MIN_QUERY_LEN = 2;
const MAX_TOKENS = 3;
const DEFAULT_LIMIT = 10;

/**
 * Combined instrument + fund autocomplete.
 *
 * Atlas Search (`$search` aggregation) is the long-term ranking engine,
 * but this v1 ships a portable regex-based implementation that works
 * locally against `mongodb-memory-server` and against an Atlas tier that
 * has not yet been provisioned. The contract is identical: callers get
 * `InstrumentMatch[]` ranked by relevance.
 *
 * Ranking heuristic (v1):
 *   1. Exact symbol / scheme-code match → score = 100
 *   2. Symbol prefix match → score = 80
 *   3. Name word-prefix match → score = 60 + popularity boost
 *   4. Name substring match → score = 40 + popularity boost
 * Popularity boost is `log1p(popularity) / 30` so a ₹1L Cr stock
 * adds about 0.6 to the score — enough to break ties without
 * dominating exact-match wins.
 */
@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Instrument.name)
    private readonly instruments: Model<InstrumentDocument>,
    @InjectModel(FundReportDocEntity.name)
    private readonly funds: Model<FundReportDocDocument>,
  ) {}

  async searchInstruments(
    rawQuery: string,
    opts: SearchOptions = {},
  ): Promise<readonly InstrumentMatch[]> {
    const query = this.normaliseQuery(rawQuery);
    if (query.length < MIN_QUERY_LEN) return [];

    const limit = opts.limit ?? DEFAULT_LIMIT;
    const regexSafe = this.escapeRegex(query);
    const prefixRegex = new RegExp(`^${regexSafe}`, "i");
    const containsRegex = new RegExp(regexSafe, "i");

    const [stocks, funds] = await Promise.all([
      opts.type === "FUND"
        ? Promise.resolve([])
        : this.findStocks(prefixRegex, containsRegex, limit),
      opts.type === "STOCK"
        ? Promise.resolve([])
        : this.findFunds(query, prefixRegex, containsRegex, limit),
    ]);

    const merged = [...stocks, ...funds]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return merged;
  }

  private normaliseQuery(raw: string): string {
    return raw
      .trim()
      .split(/\s+/)
      .slice(0, MAX_TOKENS)
      .join(" ");
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private async findStocks(
    prefixRegex: RegExp,
    containsRegex: RegExp,
    limit: number,
  ): Promise<readonly InstrumentMatch[]> {
    const docs = await this.instruments
      .find({
        $or: [
          { nseSymbol: prefixRegex },
          { yahooSymbol: prefixRegex },
          { name: containsRegex },
        ],
      })
      .limit(limit * 3)
      .lean()
      .exec();

    type StockShape = {
      _id: unknown;
      nseSymbol: string;
      name: string;
      primaryExchange?: "NSE" | "BSE";
      popularity?: number;
    };
    return (docs as unknown as StockShape[]).map((d) => ({
      id: String(d._id),
      type: "STOCK" as const,
      symbol: d.nseSymbol,
      name: d.name,
      exchange: d.primaryExchange,
      score: this.scoreStock(d, prefixRegex, containsRegex),
    }));
  }

  private async findFunds(
    query: string,
    prefixRegex: RegExp,
    containsRegex: RegExp,
    limit: number,
  ): Promise<readonly InstrumentMatch[]> {
    const docs = await this.funds
      .find({
        $or: [
          { schemeCode: query },
          { name: containsRegex },
        ],
      })
      .limit(limit * 3)
      .lean()
      .exec();

    type FundShape = {
      _id: unknown;
      schemeCode: string;
      name: string;
      meta?: { aumCr?: number };
    };
    return (docs as unknown as FundShape[]).map((d) => ({
      id: String(d._id),
      type: "FUND" as const,
      symbol: d.schemeCode,
      name: d.name,
      exchange: "AMFI" as const,
      score: this.scoreFund(d, query, prefixRegex, containsRegex),
    }));
  }

  private scoreStock(
    d: { nseSymbol: string; name: string; popularity?: number },
    prefixRegex: RegExp,
    containsRegex: RegExp,
  ): number {
    const symbol = d.nseSymbol.toUpperCase();
    const name = d.name;
    const popularity = d.popularity ?? 0;
    const boost = Math.log1p(Math.max(0, popularity)) / 30;

    if (prefixRegex.test(symbol) && symbol === prefixRegex.source.toUpperCase().replace(/^\^/, "")) {
      return 100 + boost;
    }
    if (prefixRegex.test(symbol)) return 80 + boost;
    if (prefixRegex.test(name)) return 60 + boost;
    if (containsRegex.test(name)) return 40 + boost;
    return 10 + boost;
  }

  private scoreFund(
    d: { schemeCode: string; name: string; meta?: { aumCr?: number } },
    query: string,
    prefixRegex: RegExp,
    containsRegex: RegExp,
  ): number {
    const aum = d.meta?.aumCr ?? 0;
    const boost = Math.log1p(Math.max(0, aum)) / 30;

    if (d.schemeCode === query) return 100 + boost;
    if (prefixRegex.test(d.name)) return 60 + boost;
    if (containsRegex.test(d.name)) return 40 + boost;
    return 10 + boost;
  }
}
