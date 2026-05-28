import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import {
  ANALYSIS_DISCLAIMER,
  PAST_PERF_DISCLAIMER,
} from "./disclaimers.constants";
import { sanitiseAndCheck } from "./compliance.sanitiser";

export interface AiOutputLike {
  readonly text: string;
  readonly citedSources?: readonly string[];
  readonly touchesReturns?: boolean;
}

export interface CompliantAiOutput {
  readonly text: string;
  readonly citedSources: readonly string[];
  readonly disclaimers: {
    readonly analysis: string;
    readonly pastPerformance?: string;
  };
  /** Implementation-defined extra fields (e.g. SWOT quadrants) are preserved verbatim by the interceptor. */
  readonly [extraField: string]: unknown;
}

export class ComplianceViolationException extends BadRequestException {
  constructor(public readonly forbidden: readonly string[]) {
    super({
      message: "AI output failed compliance check",
      forbidden,
    });
  }
}

/**
 * Class-scoped chokepoint for AiService outputs. Runs the
 * regex-blocklist sanitiser over the generated text and throws
 * `ComplianceViolationException` on any match. Successful payloads
 * carry the mandatory ANALYSIS_DISCLAIMER plus the optional
 * PAST_PERF_DISCLAIMER when `touchesReturns` is true.
 *
 * v1 BLOCKS rather than auto-replacing — the narrative-batch job in
 * Plan 04-02 retries up to 3 times before falling back to the
 * deterministic template.
 */
@Injectable()
export class ComplianceInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (!this.looksLikeAiOutput(value)) {
          return value;
        }
        const { violations } = sanitiseAndCheck(value.text);
        if (violations.length > 0) {
          throw new ComplianceViolationException(violations);
        }
        // Preserve every extra field the caller emitted (e.g. SWOT
        // quadrants on `SwotOutput`) — the interceptor's contract is
        // "augment with disclaimers", not "narrow to text+citedSources".
        const output: CompliantAiOutput = {
          ...(value as unknown as Record<string, unknown>),
          text: value.text,
          citedSources: value.citedSources ?? [],
          disclaimers: {
            analysis: ANALYSIS_DISCLAIMER,
            pastPerformance: value.touchesReturns
              ? PAST_PERF_DISCLAIMER
              : undefined,
          },
        };
        return output;
      }),
    );
  }

  private looksLikeAiOutput(value: unknown): value is AiOutputLike {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<AiOutputLike>;
    return typeof candidate.text === "string";
  }
}
