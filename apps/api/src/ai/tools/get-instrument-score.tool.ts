import { Type } from "@google/genai";
import {
  requireStringArg,
  ToolError,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "./tool.types";

export interface GetInstrumentScoreArgs {
  readonly symbolOrSchemeCode: string;
  readonly type: "stock" | "fund";
}

export interface InstrumentScoreData {
  readonly score: number;
  readonly verdict: string;
  readonly pillarBreakdown: Record<string, number>;
  readonly asOfDate: string;
}

async function handler(
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult<InstrumentScoreData>> {
  const sym = requireStringArg(rawArgs, "symbolOrSchemeCode");
  const type = (rawArgs as { type?: unknown }).type;
  if (type !== "stock" && type !== "fund") {
    throw new ToolError("INVALID_ARGS", "type must be 'stock' or 'fund'");
  }

  const doc =
    type === "stock"
      ? await ctx.reports.getStock(sym)
      : await ctx.fundReports.getFund(sym);
  if (!doc) throw new ToolError("NOT_FOUND", `no ${type} report for ${sym}`);

  return {
    data: {
      score: doc.score.value,
      verdict: String(doc.score.verdict),
      pillarBreakdown: {
        ...(doc.score.pillars as unknown as Record<string, number>),
      },
      asOfDate: doc.asOf,
    },
    sourceTag: `score:${type}:${sym}`,
    asOfDate: new Date(doc.asOf),
    dataVersionHash: doc.dataVersionHash,
  };
}

export const getInstrumentScoreTool: ToolDefinition<InstrumentScoreData> = {
  declaration: {
    name: "getInstrumentScore",
    description:
      "READ-ONLY accessor — never computes anything new. Returns the persisted FinSight Score, verdict, and pillar breakdown for a stock (NSE symbol) or mutual fund (AMFI scheme code).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbolOrSchemeCode: {
          type: Type.STRING,
          description: "NSE ticker (e.g. RELIANCE) or AMFI scheme code.",
        },
        type: { type: Type.STRING, enum: ["stock", "fund"] },
      },
      required: ["symbolOrSchemeCode", "type"],
    },
  },
  handler,
};
