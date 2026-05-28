import { Injectable, Logger, UseInterceptors } from "@nestjs/common";
import { ComplianceInterceptor } from "../compliance/compliance.interceptor";
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
  type AiOutput,
  type NarrativeResult,
  type SwotResult,
} from "./ai.types";
import { GeminiClient } from "./gemini.client";

const NARRATIVE_MODEL = "gemini-2.5-flash";
const SWOT_MODEL = "gemini-2.5-flash";

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

  constructor(private readonly gemini: GeminiClient) {}

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
  ): Promise<AiOutput> {
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
