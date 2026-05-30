import { Type } from "@google/genai";
import {
  requireStringArg,
  ToolError,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "./tool.types";

export interface GetTechnicalsArgs {
  readonly symbol: string;
}

export interface TechnicalsData {
  readonly rsi: number;
  readonly macdSignal: string;
  readonly dma50: number;
  readonly dma200: number;
  readonly beta: number;
  readonly asOf: string;
}

async function handler(
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult<TechnicalsData>> {
  const symbol = requireStringArg(rawArgs, "symbol");
  const doc = await ctx.reports.getStock(symbol);
  if (!doc) throw new ToolError("NOT_FOUND", `no stock report for ${symbol}`);

  const t = doc.technicals;
  return {
    data: {
      rsi: t.rsi14,
      macdSignal: t.macdSignal,
      dma50: t.dma50,
      dma200: t.dma200,
      beta: t.beta,
      asOf: doc.asOf,
    },
    sourceTag: `technicals:${symbol}`,
    asOfDate: new Date(doc.asOf),
    dataVersionHash: doc.dataVersionHash,
  };
}

export const getInstrumentTechnicalsTool: ToolDefinition<TechnicalsData> = {
  declaration: {
    name: "getInstrumentTechnicals",
    description:
      "READ-ONLY accessor — never computes anything new. Returns persisted technicals (RSI, MACD signal, 50/200-DMA, beta) for a stock.",
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
