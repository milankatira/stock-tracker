import { describe, expect, it, vi } from "vitest";
import { NotImplementedException } from "@nestjs/common";
import type { Job } from "bullmq";
import type { AiService } from "../../ai/ai.service";
import { NarrativeAuditFailedError } from "../../ai/ai.types";
import { FundNarrativeBatchProcessor } from "./fund-narrative-batch.processor";
import type { FundNarrativeContextProvider } from "./fund-narrative-context.provider";
import type { FundNarrativeBatchJobData, FundNarrativeContextBundle } from "./fund-narrative-batch.types";
import type { FundReportsService } from "../../reports/fund-reports.service";

interface ProcessorDeps {
  readonly ai: AiService;
  readonly reports: FundReportsService;
  readonly provider: FundNarrativeContextProvider;
}

function deps(): ProcessorDeps {
  return {
    ai: {
      narrative: vi.fn(),
    } as unknown as AiService,
    reports: {
      upsertNarrative: vi.fn().mockResolvedValue(undefined),
      bustCache: vi.fn().mockResolvedValue(undefined),
    } as unknown as FundReportsService,
    provider: {
      forFund: vi.fn(),
    } as unknown as FundNarrativeContextProvider,
  };
}

function bundle(overrides: Partial<FundNarrativeContextBundle> = {}): FundNarrativeContextBundle {
  return {
    schemeCode: "120000",
    dataVersionHash: "v1",
    score: 4,
    verdict: "WEAK_SCORE",
    context: {
      assetName: "Sample Fund",
      assetType: "fund",
      assetClass: "fund",
      score: 4,
      verdict: "WEAK_SCORE",
      pillars: [],
      verifiedValues: {},
    } as unknown as FundNarrativeContextBundle["context"],
    ...overrides,
  };
}

function makeJob(data: Partial<FundNarrativeBatchJobData> = {}): Job<FundNarrativeBatchJobData> {
  return {
    data: {
      schemeCode: "120000",
      dataVersionHash: "v1",
      ...data,
    },
  } as unknown as Job<FundNarrativeBatchJobData>;
}

describe("FundNarrativeBatchProcessor", () => {
  it("skips when dataVersionHash drifted from the live bundle", async () => {
    const d = deps();
    vi.mocked(d.provider.forFund).mockResolvedValue(bundle({ dataVersionHash: "v9" }));
    const p = new FundNarrativeBatchProcessor(d.ai, d.reports, d.provider);

    const result = await p.process(makeJob({ dataVersionHash: "v1" }));

    expect(result).toEqual({ schemeCode: "120000", skipped: "stale-version" });
    expect(d.reports.upsertNarrative).not.toHaveBeenCalled();
  });

  it("calls upsertNarrative with the AI output when narrative succeeds", async () => {
    const d = deps();
    vi.mocked(d.provider.forFund).mockResolvedValue(bundle());
    vi.mocked(d.ai.narrative).mockResolvedValue({
      text: "Solid fund.",
      citedSources: ["score"],
      touchesReturns: true,
      generatedAt: new Date().toISOString(),
      auditPassed: true,
    });
    const p = new FundNarrativeBatchProcessor(d.ai, d.reports, d.provider);

    const result = await p.process(makeJob());

    expect(result).toEqual({ schemeCode: "120000", ok: true, fallbackUsed: false });
    expect(d.reports.upsertNarrative).toHaveBeenCalledWith(
      "120000",
      expect.objectContaining({ dataVersionHash: "v1", fallbackUsed: false }),
    );
  });

  it("falls back to the fund-prefixed template on audit exhaustion", async () => {
    const d = deps();
    vi.mocked(d.provider.forFund).mockResolvedValue(bundle({ score: 4, verdict: "WEAK_SCORE" }));
    vi.mocked(d.ai.narrative).mockRejectedValue(
      new NarrativeAuditFailedError(3, "audit exhausted"),
    );
    const p = new FundNarrativeBatchProcessor(d.ai, d.reports, d.provider);

    const result = await p.process(makeJob());

    expect(result.fallbackUsed).toBe(true);
    const [, payload] = vi.mocked(d.reports.upsertNarrative).mock.calls[0]!;
    expect(payload.narrative.paragraph).toBe(
      "FinSight Fund Score: 4. Verdict: Weak Score.",
    );
  });

  it("re-throws ComplianceViolationException (no fallback for compliance breaches)", async () => {
    const d = deps();
    vi.mocked(d.provider.forFund).mockResolvedValue(bundle());
    const boom = new Error("ComplianceViolationException");
    vi.mocked(d.ai.narrative).mockRejectedValue(boom);
    const p = new FundNarrativeBatchProcessor(d.ai, d.reports, d.provider);

    await expect(p.process(makeJob())).rejects.toBe(boom);
  });

  it("propagates NotImplementedException from the provider stub", async () => {
    const d = deps();
    vi.mocked(d.provider.forFund).mockRejectedValue(
      new NotImplementedException("seam"),
    );
    const p = new FundNarrativeBatchProcessor(d.ai, d.reports, d.provider);

    await expect(p.process(makeJob())).rejects.toBeInstanceOf(
      NotImplementedException,
    );
  });
});
