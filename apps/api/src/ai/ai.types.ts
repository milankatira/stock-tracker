/** Public AI output contract exchanged across `ComplianceInterceptor`. */
export interface AiOutput {
  readonly text: string;
  readonly citedSources: readonly string[];
  /** When `true`, the interceptor attaches `PAST_PERF_DISCLAIMER`. */
  readonly touchesReturns?: boolean;
}

export interface NarrativeResult extends AiOutput {
  readonly generatedAt: string;
  readonly auditPassed: true;
}

export interface SwotResult {
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly opportunities: readonly string[];
  readonly threats: readonly string[];
  readonly citedSources: readonly string[];
}

/** Failure mode emitted when the audit loop exhausts its retry budget. */
export class NarrativeAuditFailedError extends Error {
  constructor(public readonly attempts: number, message: string) {
    super(message);
    this.name = "NarrativeAuditFailedError";
  }
}
