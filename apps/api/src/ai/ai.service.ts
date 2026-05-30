import { Inject, Injectable, Logger, UseInterceptors } from "@nestjs/common";
import type { Content, FunctionCall, Part } from "@google/genai";
import { ComplianceInterceptor } from "../compliance/compliance.interceptor";
import { SentenceBuffer } from "./sanitiser/sentence-buffer";
import { RefusalCategory } from "./refusal/refusal.enum";
import { buildChatSystemPrompt } from "./prompts/chat-system.prompt";
import {
  TOOL_REGISTRY_TOKEN,
  type ToolRegistry,
} from "./tools/tools.registry";
import { ToolError, type ToolContext } from "./tools/tool.types";
import { auditNumbers } from "./numeric-audit";
import {
  substituteSlots,
  UnknownPlaceholderError,
} from "./template-slots";
import {
  NARRATIVE_RESPONSE_SCHEMA,
  NARRATIVE_SYSTEM_PROMPT,
} from "./prompts/narrative.prompt";
import {
  SWOT_RESPONSE_SCHEMA,
  SWOT_SYSTEM_PROMPT,
} from "./prompts/swot.prompt";
import {
  NarrativeAuditFailedError,
  type NarrativeResult,
  type SentimentLabel,
  type SentimentResult,
  type SwotOutput,
  type SwotResult,
} from "./ai.types";
import { GeminiClient } from "./gemini.client";
import { sanitiseAndCheck } from "../compliance/compliance.sanitiser";
import {
  SENTIMENT_RESPONSE_SCHEMA,
  SENTIMENT_SYSTEM_PROMPT,
} from "./prompts/sentiment.prompt";
import { NEWS_EMBEDDING_DIM } from "../news/vector/vector-index.constants";

const NARRATIVE_MODEL = "gemini-2.5-flash";
const SWOT_MODEL = "gemini-2.5-flash";
const SENTIMENT_MODEL = "gemini-2.5-flash-lite";
const EMBEDDING_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-2.5-flash";
const MAX_TOOL_TURNS = 5;

export interface ChatCitation {
  readonly sourceTag: string;
  readonly asOfDate: Date;
}

/**
 * Callback-driven contract for `AiService.chatStream`. The caller
 * (ChatService) supplies a pre-built `ToolContext` (so AiModule does not
 * depend on every read-path module) and receives streamed events via the
 * callbacks, which it forwards onto the SSE `Observable`.
 */
export interface ChatStreamOpts {
  readonly history: Content[];
  readonly userMessage: string;
  readonly toolContext: ToolContext;
  readonly abortSignal: AbortSignal;
  readonly onSafeChunk: (text: string) => void;
  readonly onToolStart: (name: string) => void;
  readonly onToolEnd: (name: string, citation: ChatCitation) => void;
  readonly onRefusal: (cat: RefusalCategory, meta?: Record<string, unknown>) => void;
  readonly onComplete: (
    fullAssistantText: string,
    citations: ChatCitation[],
  ) => Promise<void> | void;
}

interface RawSentiment {
  readonly sentiment: SentimentLabel;
  readonly confidence: number;
  readonly rationaleOneLine: string;
}

interface RawNarrative {
  readonly paragraph: string;
  readonly placeholders: readonly string[];
  readonly citedSources: readonly string[];
}

interface RawSwot {
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly opportunities: readonly string[];
  readonly threats: readonly string[];
  readonly citedSources: readonly string[];
}

export interface NarrativeContext {
  readonly score: number;
  readonly verdict: "STRONG_SCORE" | "CAUTION" | "WEAK_SCORE";
  readonly verifiedValues: Record<string, string>;
  readonly userPrompt: string;
  readonly touchesReturns?: boolean;
}

/**
 * Public AI facade. Every public method is wrapped by the
 * class-scoped `ComplianceInterceptor`, so the only way out of this
 * service is through the sanitiser + disclaimer injection chain
 * (COMP-02 chokepoint).
 *
 * The `narrative()` retry loop encodes the open-question #5
 * recommendation: up to 3 attempts where each attempt re-prompts
 * after a slot or audit miss; final failure throws
 * `NarrativeAuditFailedError` so the narrative-batch processor
 * (Plan 04-02) can fall back to the deterministic template.
 */
@Injectable()
@UseInterceptors(ComplianceInterceptor)
export class AiService {
  private readonly logger = new Logger(AiService.name);
  static readonly MAX_RETRIES = 3;

  constructor(
    private readonly gemini: GeminiClient,
    @Inject(TOOL_REGISTRY_TOKEN) private readonly tools: ToolRegistry,
  ) {}

  /**
   * Stream a compliance-safe chat answer (CHAT-01/03/04). Runs the
   * manual function-calling interleave loop proven in the Plan 01 spike:
   * stream → collect functionCalls → execute read-only tools → append a
   * model functionCall turn + a user functionResponse turn → re-stream.
   * Text flows through a SentenceBuffer so the client only ever sees
   * fully-formed, sanitised sentences. Tool turns are capped at N=5.
   */
  async chatStream(opts: ChatStreamOpts): Promise<void> {
    const buffer = new SentenceBuffer();
    const citations: ChatCitation[] = [];
    const safe: string[] = [];
    let toolTurns = 0;

    let contents: Content[] = [
      ...opts.history,
      { role: "user", parts: [{ text: opts.userMessage }] },
    ];

    const systemInstruction = buildChatSystemPrompt(opts.toolContext.scope);

    // Bounded outer loop — each iteration is one Gemini stream; tool turns
    // accumulate across iterations and are hard-capped at MAX_TOOL_TURNS.
    for (let iteration = 0; iteration <= MAX_TOOL_TURNS + 1; iteration += 1) {
      if (opts.abortSignal.aborted) return;

      const stream = await this.gemini.genai.models.generateContentStream({
        model: CHAT_MODEL,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: [...this.tools.declarations] }],
          temperature: 0.3,
          maxOutputTokens: 1024,
          abortSignal: opts.abortSignal,
        },
      });

      const calls: FunctionCall[] = [];
      for await (const chunk of stream) {
        if (opts.abortSignal.aborted) return;
        if (chunk.functionCalls?.length) {
          calls.push(...chunk.functionCalls);
          continue;
        }
        if (chunk.text) {
          for (const sentence of buffer.feed(chunk.text)) {
            if (buffer.sawForbidden) {
              opts.onRefusal(RefusalCategory.NON_COMPLIANT_BUYSELL);
              return;
            }
            safe.push(sentence);
            opts.onSafeChunk(sentence);
          }
        }
      }

      if (calls.length === 0) {
        for (const sentence of buffer.flush()) {
          if (buffer.sawForbidden) {
            opts.onRefusal(RefusalCategory.NON_COMPLIANT_BUYSELL);
            return;
          }
          safe.push(sentence);
          opts.onSafeChunk(sentence);
        }
        await opts.onComplete(safe.join(" "), citations);
        return;
      }

      // Execute every requested tool, honouring the N=5 cap.
      const responseParts: Part[] = [];
      for (const fc of calls) {
        toolTurns += 1;
        if (toolTurns > MAX_TOOL_TURNS) {
          opts.onRefusal(RefusalCategory.TOOL_LIMIT_EXCEEDED);
          return;
        }
        const name = fc.name ?? "unknown";
        opts.onToolStart(name);
        const response = await this.runTool(fc, name, opts, citations);
        responseParts.push({ functionResponse: { name, response } });
      }

      contents = [
        ...contents,
        { role: "model", parts: calls.map((fc) => ({ functionCall: fc })) },
        { role: "user", parts: responseParts },
      ];
    }
  }

  private async runTool(
    fc: FunctionCall,
    name: string,
    opts: ChatStreamOpts,
    citations: ChatCitation[],
  ): Promise<Record<string, unknown>> {
    try {
      const result = await this.tools.execute(
        { name, args: fc.args ?? {} },
        opts.toolContext,
      );
      const citation: ChatCitation = {
        sourceTag: result.sourceTag,
        asOfDate: result.asOfDate,
      };
      citations.push(citation);
      opts.onToolEnd(name, citation);
      return result.data as Record<string, unknown>;
    } catch (err) {
      // Surface a structured error to Gemini so it can recover gracefully,
      // rather than aborting the whole stream.
      const code = err instanceof ToolError ? err.code : "ERROR";
      opts.onToolEnd(name, { sourceTag: `error:${name}`, asOfDate: new Date(0) });
      this.logger.warn({ tool: name, code }, "chat_tool_failed");
      return { error: code };
    }
  }

  async narrative(
    context: NarrativeContext,
    maxRetries = AiService.MAX_RETRIES,
  ): Promise<NarrativeResult> {
    const verified = context.verifiedValues;
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const raw = await this.callNarrative(context, attempt, lastError);
      try {
        const text = substituteSlots(raw.paragraph, verified);
        const audit = auditNumbers(text, verified);
        if (!audit.ok) {
          lastError = `unexpected numeric tokens: ${audit.unexpectedTokens.join(", ")}`;
          this.logger.warn(
            { attempt, unexpected: audit.unexpectedTokens },
            "narrative_audit_failed",
          );
          continue;
        }
        return {
          text,
          citedSources: raw.citedSources,
          touchesReturns: context.touchesReturns,
          generatedAt: new Date().toISOString(),
          auditPassed: true,
        };
      } catch (err) {
        if (err instanceof UnknownPlaceholderError) {
          lastError = `unknown placeholder: ${err.placeholder}`;
          this.logger.warn(
            { attempt, placeholder: err.placeholder },
            "narrative_placeholder_unknown",
          );
          continue;
        }
        throw err;
      }
    }
    throw new NarrativeAuditFailedError(
      maxRetries,
      `narrative audit failed after ${maxRetries} attempts (${lastError ?? "no detail"})`,
    );
  }

  async swot(
    context: NarrativeContext,
    maxRetries = AiService.MAX_RETRIES,
  ): Promise<SwotOutput> {
    const verified = context.verifiedValues;
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const raw = await this.callSwot(context, attempt, lastError);
      try {
        const joined = this.joinSwotBullets(raw);
        const text = substituteSlots(joined, verified);
        const audit = auditNumbers(text, verified);
        if (!audit.ok) {
          lastError = `unexpected numeric tokens in SWOT: ${audit.unexpectedTokens.join(", ")}`;
          this.logger.warn(
            { attempt, unexpected: audit.unexpectedTokens },
            "swot_audit_failed",
          );
          continue;
        }
        return {
          text,
          citedSources: raw.citedSources,
          touchesReturns: context.touchesReturns,
          strengths: [...raw.strengths].map((b) => substituteSlots(b, verified)),
          weaknesses: [...raw.weaknesses].map((b) => substituteSlots(b, verified)),
          opportunities: [...raw.opportunities].map((b) =>
            substituteSlots(b, verified),
          ),
          threats: [...raw.threats].map((b) => substituteSlots(b, verified)),
        };
      } catch (err) {
        if (err instanceof UnknownPlaceholderError) {
          lastError = `unknown placeholder in SWOT: ${err.placeholder}`;
          continue;
        }
        throw err;
      }
    }
    throw new NarrativeAuditFailedError(
      maxRetries,
      `SWOT audit failed after ${maxRetries} attempts (${lastError ?? "no detail"})`,
    );
  }

  /** Visible for downstream Plan 04-02 helpers. */
  buildSwotResult(raw: RawSwot): SwotResult {
    return {
      strengths: [...raw.strengths],
      weaknesses: [...raw.weaknesses],
      opportunities: [...raw.opportunities],
      threats: [...raw.threats],
      citedSources: [...raw.citedSources],
    };
  }

  /**
   * Classify the sentiment of a news headline toward its instrument
   * (NEWS-02). Returns the enum label + confidence + a one-line
   * rationale. The rationale is run through the compliance sanitiser
   * here — on any forbidden-verb match it is dropped to `null` rather
   * than blocking the whole classification, so a compliant label still
   * persists. The enum label is schema-constrained and inherently safe.
   */
  async classifySentiment(text: string): Promise<SentimentResult> {
    const response = await this.gemini.genai.models.generateContent({
      model: SENTIMENT_MODEL,
      contents: text,
      config: {
        systemInstruction: SENTIMENT_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: SENTIMENT_RESPONSE_SCHEMA as unknown as Record<
          string,
          unknown
        >,
        temperature: 0.0,
      },
    });
    const raw = this.parseStructured<RawSentiment>(response.text ?? "");
    const { violations } = sanitiseAndCheck(raw.rationaleOneLine ?? "");
    if (violations.length > 0) {
      // Do NOT log the raw rationale — that would re-introduce the
      // forbidden token into logs. Log only the matched rule labels.
      this.logger.warn(
        { violations },
        "sentiment_rationale_dropped_on_compliance_violation",
      );
    }
    return {
      sentiment: raw.sentiment,
      confidence: raw.confidence,
      rationaleOneLine: violations.length > 0 ? null : raw.rationaleOneLine,
    };
  }

  /**
   * Embed a document for storage in Atlas Vector Search (NEWS-03).
   * Uses `RETRIEVAL_DOCUMENT` task type at `NEWS_EMBEDDING_DIM` so the
   * vector exactly matches the boot-asserted index dimension. Asserts
   * the returned length — second line of defence after the boot check.
   */
  async embedForStorage(text: string): Promise<number[]> {
    return this.embed(text, "RETRIEVAL_DOCUMENT");
  }

  /** Embed a search query (`RETRIEVAL_QUERY`). Consumed by Phase 7. */
  async embedForQuery(text: string): Promise<number[]> {
    return this.embed(text, "RETRIEVAL_QUERY");
  }

  private async embed(text: string, taskType: string): Promise<number[]> {
    const response = await this.gemini.genai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { taskType, outputDimensionality: NEWS_EMBEDDING_DIM },
    });
    const values = response.embeddings?.[0]?.values;
    if (!values || values.length !== NEWS_EMBEDDING_DIM) {
      throw new Error(
        `Embedding dim mismatch: got ${values?.length ?? "none"}, expected ${NEWS_EMBEDDING_DIM}`,
      );
    }
    return values;
  }

  private async callNarrative(
    context: NarrativeContext,
    attempt: number,
    lastError: string | null,
  ): Promise<RawNarrative> {
    const response = await this.gemini.genai.models.generateContent({
      model: NARRATIVE_MODEL,
      contents: this.composeUserPrompt(context, attempt, lastError),
      config: {
        systemInstruction: NARRATIVE_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: NARRATIVE_RESPONSE_SCHEMA as unknown as Record<
          string,
          unknown
        >,
        temperature: 0.2,
      },
    });
    return this.parseStructured<RawNarrative>(response.text ?? "");
  }

  private async callSwot(
    context: NarrativeContext,
    attempt: number,
    lastError: string | null,
  ): Promise<RawSwot> {
    const response = await this.gemini.genai.models.generateContent({
      model: SWOT_MODEL,
      contents: this.composeUserPrompt(context, attempt, lastError),
      config: {
        systemInstruction: SWOT_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: SWOT_RESPONSE_SCHEMA as unknown as Record<
          string,
          unknown
        >,
        temperature: 0.3,
      },
    });
    return this.parseStructured<RawSwot>(response.text ?? "");
  }

  private composeUserPrompt(
    context: NarrativeContext,
    attempt: number,
    lastError: string | null,
  ): string {
    const lines = [
      `Score: ${context.score}`,
      `Verdict: ${context.verdict}`,
      `Verified placeholders: ${Object.keys(context.verifiedValues).join(", ")}`,
      context.userPrompt,
    ];
    if (attempt > 1 && lastError) {
      lines.push(`Retry hint (attempt ${attempt}): ${lastError}`);
    }
    return lines.join("\n");
  }

  private parseStructured<T>(raw: string): T {
    if (!raw || raw.length === 0) {
      throw new Error("Gemini returned an empty response body");
    }
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      throw new Error(
        `Gemini returned malformed JSON: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      );
    }
  }

  private joinSwotBullets(raw: RawSwot): string {
    return [
      ...raw.strengths,
      ...raw.weaknesses,
      ...raw.opportunities,
      ...raw.threats,
    ].join("\n");
  }
}
