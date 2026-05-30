import type { FunctionDeclaration } from "@google/genai";
import type {
  FundReportDoc,
  InstrumentMatch,
  StockReportDoc,
} from "@finsight/shared";

/**
 * Read-only tool layer for Ask FinSight (CHAT-02). Tools read ONLY
 * persisted/materialised data through the existing Phase 3–6 read-path
 * services — they never recompute a score, never call Gemini, and never
 * import from `scoring/` (enforced by `tools.no-compute.spec.ts`). This
 * is the structural half of the "Gemini never invents a number"
 * invariant: the model can only ever see numbers a tool fetched from the
 * database.
 *
 * `ToolContext` is expressed as narrow structural readers (not the Nest
 * service classes) so the tools stay pure and trivially mockable.
 */

/** Minimal shape a news item exposes to a tool (matches `NewsService.getRecentForTicker`). */
export interface NewsReadItem {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly source: string;
  readonly publishedAt: string;
  readonly sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | null;
}

export interface StockReportReader {
  getStock(ticker: string): Promise<StockReportDoc | null>;
}

export interface FundReportReader {
  getFund(schemeCode: string): Promise<FundReportDoc | null>;
}

export interface NewsReader {
  getRecentForTicker(
    ticker: string,
    limit?: number,
  ): Promise<readonly NewsReadItem[]>;
}

export interface SearchReader {
  searchInstruments(
    query: string,
    opts?: { limit?: number; type?: "STOCK" | "FUND" },
  ): Promise<readonly InstrumentMatch[]>;
}

export type ChatScopeType = "stock" | "fund" | "portfolio" | "compare";

export interface ToolContext {
  readonly reports: StockReportReader;
  readonly fundReports: FundReportReader;
  readonly news: NewsReader;
  readonly search: SearchReader;
  /** Server-derived; never trusted from the model. */
  readonly userId: string;
  readonly scope: { readonly type: ChatScopeType; readonly symbols: readonly string[] };
}

/**
 * Uniform tool output. Every tool carries lineage so the citation
 * validator (Plan 03) and the UI can prove which persisted record backed
 * each claim. `dataVersionHash` links to the EOD recompute that produced
 * the underlying numbers (or a deterministic content marker for the
 * news/search tools, which are not score-derived).
 */
export interface ToolResult<T> {
  readonly data: T;
  readonly sourceTag: string;
  readonly asOfDate: Date;
  readonly dataVersionHash: string;
}

/**
 * `handler` takes `unknown` args by contract: Gemini emits FunctionCall
 * arguments as untrusted runtime values, so every handler validates
 * (`requireStringArg` / `optionalIntArg`) before use. The per-tool
 * `*Args` interfaces document the expected shape but are not enforced at
 * the call site.
 */
export interface ToolDefinition<TData> {
  readonly declaration: FunctionDeclaration;
  readonly handler: (args: unknown, ctx: ToolContext) => Promise<ToolResult<TData>>;
}

export type ToolErrorCode =
  | "NOT_FOUND"
  | "INVALID_ARGS"
  | "UNKNOWN_TOOL"
  | "NO_SCORE_YET";

/**
 * Thrown by a tool handler so the chat loop can feed a structured error
 * back to Gemini (which can then recover or apologise) rather than
 * returning `null` — the SDK expects a response or a throw.
 */
export class ToolError extends Error {
  constructor(
    public readonly code: ToolErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ToolError";
  }
}

/** Shared validation helper: assert a string arg is present and non-empty. */
export function requireStringArg(
  args: unknown,
  key: string,
): string {
  if (
    typeof args !== "object" ||
    args === null ||
    !(key in args) ||
    typeof (args as Record<string, unknown>)[key] !== "string" ||
    ((args as Record<string, string>)[key]).trim().length === 0
  ) {
    throw new ToolError("INVALID_ARGS", `missing or invalid string arg: ${key}`);
  }
  return (args as Record<string, string>)[key].trim();
}

/** Optional positive-integer arg with a default. */
export function optionalIntArg(
  args: unknown,
  key: string,
  fallback: number,
): number {
  if (typeof args !== "object" || args === null || !(key in args)) {
    return fallback;
  }
  const raw = (args as Record<string, unknown>)[key];
  if (raw === undefined || raw === null) return fallback;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ToolError("INVALID_ARGS", `invalid numeric arg: ${key}`);
  }
  return Math.floor(n);
}
