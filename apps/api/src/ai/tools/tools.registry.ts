import type { FunctionDeclaration } from "@google/genai";
import {
  ToolError,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "./tool.types";
import { getInstrumentScoreTool } from "./get-instrument-score.tool";
import { getInstrumentFundamentalsTool } from "./get-instrument-fundamentals.tool";
import { getInstrumentTechnicalsTool } from "./get-instrument-technicals.tool";
import { getFundReturnsTool } from "./get-fund-returns.tool";
import { getRecentNewsTool } from "./get-recent-news.tool";
import { comparePeersTool } from "./compare-peers.tool";
import { searchInstrumentsTool } from "./search-instruments.tool";

/**
 * The 7 read-only Ask FinSight tools, keyed by their Gemini declaration
 * name. MUST NOT import from `../../scoring/` — enforced by
 * `__tests__/tools.no-compute.spec.ts`.
 */
export const ALL_TOOLS: Readonly<
  Record<string, ToolDefinition<unknown>>
> = {
  getInstrumentScore: getInstrumentScoreTool as ToolDefinition<unknown>,
  getInstrumentFundamentals:
    getInstrumentFundamentalsTool as ToolDefinition<unknown>,
  getInstrumentTechnicals:
    getInstrumentTechnicalsTool as ToolDefinition<unknown>,
  getFundReturns: getFundReturnsTool as ToolDefinition<unknown>,
  getRecentNews: getRecentNewsTool as ToolDefinition<unknown>,
  comparePeers: comparePeersTool as ToolDefinition<unknown>,
  searchInstruments: searchInstrumentsTool as ToolDefinition<unknown>,
};

export interface ToolRegistry {
  readonly declarations: readonly FunctionDeclaration[];
  execute(
    fc: { readonly name: string; readonly args: unknown },
    ctx: ToolContext,
  ): Promise<ToolResult<unknown>>;
}

export const TOOL_REGISTRY: ToolRegistry = {
  declarations: Object.values(ALL_TOOLS).map((t) => t.declaration),
  async execute(fc, ctx) {
    const tool = ALL_TOOLS[fc.name];
    if (!tool) throw new ToolError("UNKNOWN_TOOL", fc.name);
    return tool.handler(fc.args, ctx);
  },
};

/** DI token for `@Inject(TOOL_REGISTRY_TOKEN)` in Plan 02 + Plan 04. */
export const TOOL_REGISTRY_TOKEN = "TOOL_REGISTRY" as const;
