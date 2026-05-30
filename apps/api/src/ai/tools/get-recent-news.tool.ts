import { Type } from "@google/genai";
import {
  optionalIntArg,
  requireStringArg,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "./tool.types";

export interface GetRecentNewsArgs {
  readonly symbol: string;
  readonly sinceDays?: number;
}

export interface RecentNewsItem {
  readonly title: string;
  readonly sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  readonly url: string;
  readonly publishedAt: string;
}

const MAX_ARTICLES = 10;
const DAY_MS = 86_400_000;

async function handler(
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult<readonly RecentNewsItem[]>> {
  const symbol = requireStringArg(rawArgs, "symbol");
  const sinceDays = optionalIntArg(rawArgs, "sinceDays", 7);

  const raw = await ctx.news.getRecentForTicker(symbol, MAX_ARTICLES);
  const cutoff = Date.now() - sinceDays * DAY_MS;
  const items: RecentNewsItem[] = raw
    .filter((n) => new Date(n.publishedAt).getTime() >= cutoff)
    .slice(0, MAX_ARTICLES)
    .map((n) => ({
      title: n.title,
      // Graceful default — an un-classified article reads as NEUTRAL, never crashes.
      sentiment: n.sentiment ?? "NEUTRAL",
      url: n.url,
      publishedAt: n.publishedAt,
    }));

  const newest = items[0]?.publishedAt;
  return {
    data: items,
    sourceTag: `news:${symbol}:${sinceDays}d`,
    asOfDate: newest ? new Date(newest) : new Date(0),
    dataVersionHash: `news:${symbol}:${items.length}:${newest ?? "none"}`,
  };
}

export const getRecentNewsTool: ToolDefinition<readonly RecentNewsItem[]> = {
  declaration: {
    name: "getRecentNews",
    description:
      "READ-ONLY accessor — never computes anything new. Returns up to 10 recent persisted news headlines for a stock with their AI sentiment tags.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: "NSE ticker symbol." },
        sinceDays: {
          type: Type.NUMBER,
          description: "Look-back window in days (default 7).",
        },
      },
      required: ["symbol"],
    },
  },
  handler,
};
