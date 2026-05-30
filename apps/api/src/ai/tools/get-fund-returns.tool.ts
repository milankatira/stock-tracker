import { Type } from "@google/genai";
import {
  requireStringArg,
  ToolError,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "./tool.types";

export interface GetFundReturnsArgs {
  readonly schemeCode: string;
}

interface ReturnsBucket {
  readonly "1y": number;
  readonly "3y": number;
  readonly "5y": number;
  readonly "10y": number;
}

export interface FundReturnsData {
  readonly returns: ReturnsBucket;
  readonly benchmarkReturns: ReturnsBucket;
  readonly category: string;
}

async function handler(
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult<FundReturnsData>> {
  const schemeCode = requireStringArg(rawArgs, "schemeCode");
  const doc = await ctx.fundReports.getFund(schemeCode);
  if (!doc) throw new ToolError("NOT_FOUND", `no fund report for ${schemeCode}`);

  return {
    data: {
      returns: doc.returns.fund,
      benchmarkReturns: doc.returns.benchmark,
      category: doc.category,
    },
    sourceTag: `returns:${schemeCode}`,
    asOfDate: new Date(doc.asOf),
    dataVersionHash: doc.dataVersionHash,
  };
}

export const getFundReturnsTool: ToolDefinition<FundReturnsData> = {
  declaration: {
    name: "getFundReturns",
    description:
      "READ-ONLY accessor — never computes anything new. Returns persisted trailing returns (1y/3y/5y/10y) for a mutual fund vs its benchmark, plus the fund category.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        schemeCode: {
          type: Type.STRING,
          description: "AMFI scheme code (numeric string).",
        },
      },
      required: ["schemeCode"],
    },
  },
  handler,
};
