import { Injectable, NotImplementedException } from "@nestjs/common";

/**
 * Precomputed report-doc persistence layer. This file ships as the
 * typed contract that Plan 04-02's narrative-batch processor compiles
 * + tests against. Plan 04-03 fills the body (Mongo upsert + Redis
 * cache bust).
 *
 * Note: this `ReportsService` is distinct from
 * `apps/api/src/modules/reports/reports.service.ts`, which owns the
 * Phase 2 saved-report-history feature (per-user persisted reports).
 * The two concerns coexist:
 *   - `modules/reports/`  — owner-scoped saved-report storage.
 *   - `reports/`          — precomputed AI-narrative + scoring doc
 *                            consumed by the public stock report API.
 */

export interface UpsertNarrativePayload {
  readonly narrative: {
    readonly paragraph: string;
    readonly citedSources: readonly string[];
    readonly generatedAt: string;
    readonly auditPassed: true;
  };
  readonly swot: {
    readonly strengths: readonly string[];
    readonly weaknesses: readonly string[];
    readonly opportunities: readonly string[];
    readonly threats: readonly string[];
    readonly citedSources: readonly string[];
    readonly generatedAt: string;
    readonly auditPassed: true;
  };
  readonly dataVersionHash: string;
  readonly fallbackUsed?: boolean;
}

@Injectable()
export class ReportsService {
  async upsertNarrative(
    _ticker: string,
    _payload: UpsertNarrativePayload,
  ): Promise<void> {
    throw new NotImplementedException(
      "ReportsService.upsertNarrative is a Plan 04-02 ↔ Plan 04-03 interface seam — wire the Mongo upsert before enabling the narrative-batch worker.",
    );
  }

  async bustCache(_ticker: string): Promise<void> {
    throw new NotImplementedException(
      "ReportsService.bustCache is a Plan 04-02 ↔ Plan 04-03 interface seam — wire the Redis bust before enabling the narrative-batch worker.",
    );
  }
}
