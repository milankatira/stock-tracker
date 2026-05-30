import { Type } from "@google/genai";
import {
  optionalIntArg,
  requireStringArg,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "./tool.types";

export interface SearchInstrumentsArgs {
  readonly query: string;
  readonly limit?: number;
}

export interface SearchHit {
  readonly symbol: string;
  readonly name: string;
  readonly type: "STOCK" | "FUND";
  readonly price?: number;
}

function normalise(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

async function handler(
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult<readonly SearchHit[]>> {
  const query = requireStringArg(rawArgs, "query");
  const limit = optionalIntArg(rawArgs, "limit", 5);

  const matches = await ctx.search.searchInstruments(query, { limit });
  const hits: SearchHit[] = matches.map((m) => ({
    symbol: m.symbol,
    name: m.name,
    type: m.type,
  }));

  return {
    data: hits,
    sourceTag: `search:${normalise(query)}`,
    asOfDate: new Date(0),
    dataVersionHash: `search:${normalise(query)}:${hits.length}`,
  };
}

export const searchInstrumentsTool: ToolDefinition<readonly SearchHit[]> = {
  declaration: {
    name: "searchInstruments",
    description:
      "READ-ONLY accessor — never computes anything new. Autocomplete search over persisted instruments; returns matching stocks/funds (symbol, name, type).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Free-text search query." },
        limit: {
          type: Type.NUMBER,
          description: "Max results (default 5).",
        },
      },
      required: ["query"],
    },
  },
  handler,
};
