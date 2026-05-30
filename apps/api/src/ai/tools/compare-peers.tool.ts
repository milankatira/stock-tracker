import { Type } from "@google/genai";
import {
  optionalIntArg,
  requireStringArg,
  ToolError,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "./tool.types";

export interface ComparePeersArgs {
  readonly symbol: string;
  readonly count?: number;
}

export interface PeerEntry {
  readonly symbol: string;
  readonly name: string;
  readonly score: number;
  readonly sector?: string;
}

async function handler(
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult<readonly PeerEntry[]>> {
  const symbol = requireStringArg(rawArgs, "symbol");
  const count = optionalIntArg(rawArgs, "count", 3);

  const doc = await ctx.reports.getStock(symbol);
  if (!doc) throw new ToolError("NOT_FOUND", `no stock report for ${symbol}`);

  const peers: PeerEntry[] = doc.peers.slice(0, count).map((p) => ({
    symbol: p.ticker,
    name: p.name,
    score: p.score,
    sector: p.sector,
  }));

  return {
    data: peers,
    sourceTag: `peers:${symbol}:n${count}`,
    asOfDate: new Date(doc.asOf),
    dataVersionHash: doc.dataVersionHash,
  };
}

export const comparePeersTool: ToolDefinition<readonly PeerEntry[]> = {
  declaration: {
    name: "comparePeers",
    description:
      "READ-ONLY accessor — never computes anything new. Returns the persisted peer set (symbol, name, FinSight Score, sector) for a stock.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: "NSE ticker symbol." },
        count: {
          type: Type.NUMBER,
          description: "Number of peers to return (default 3).",
        },
      },
      required: ["symbol"],
    },
  },
  handler,
};
