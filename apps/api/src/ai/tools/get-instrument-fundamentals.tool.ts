import { Type } from "@google/genai";
import {
  requireStringArg,
  ToolError,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "./tool.types";

export interface GetFundamentalsArgs {
  readonly symbol: string;
}

export interface FundamentalsData {
  readonly pe: number;
  readonly pb: number;
  readonly roe: number;
  readonly roce: number;
  readonly debtEquity: number;
  readonly marketCap: number;
  readonly asOf: string;
}

async function handler(
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult<FundamentalsData>> {
  const symbol = requireStringArg(rawArgs, "symbol");
  const doc = await ctx.reports.getStock(symbol);
  if (!doc) throw new ToolError("NOT_FOUND", `no stock report for ${symbol}`);

  const f = doc.fundamentals;
  return {
    // Locked projection — never leak internal repo fields.
    data: {
      pe: f.pe,
      pb: f.pb,
      roe: f.roe,
      roce: f.roce,
      debtEquity: f.debtEquity,
      marketCap: f.marketCap,
      asOf: doc.asOf,
    },
    sourceTag: `fundamentals:${symbol}`,
    asOfDate: new Date(doc.asOf),
    dataVersionHash: doc.dataVersionHash,
  };
}

export const getInstrumentFundamentalsTool: ToolDefinition<FundamentalsData> = {
  declaration: {
    name: "getInstrumentFundamentals",
    description:
      "READ-ONLY accessor — never computes anything new. Returns persisted fundamentals (P/E, P/B, ROE, ROCE, D/E, market cap) for a stock.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: "NSE ticker symbol." },
      },
      required: ["symbol"],
    },
  },
  handler,
};
