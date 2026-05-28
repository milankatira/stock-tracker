import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { AiService } from "../../ai/ai.service";
import { NarrativeAuditFailedError } from "../../ai/ai.types";
import type { ReportsService } from "../../reports/reports.service";
import type { NarrativeContextProvider } from "./narrative-context.provider";
import { NarrativeBatchProcessor } from "./narrative-batch.processor";
import {
  NARRATIVE_BATCH_JOB_NAME,
  type NarrativeBatchJobData,
  type NarrativeContextBundle,
} from "./narrative-batch.types";
import { ComplianceViolationException } from "../../compliance/compliance.interceptor";

const baseBundle: NarrativeContextBundle = {
  ticker: "RELIANCE",
  dataVersionHash: "v1",
  score: 7,
  verdict: "STRONG_SCORE",
  context: {
    score: 7,
    verdict: "STRONG_SCORE",
    verifiedValues: { roe: "13.7%" },
    userPrompt: "Summarise",
  },
};

const swotPayload = {
  text: "ROE 13.7%",
  citedSources: ["scoreInput.financials.roe"],
  strengths: ["Strong ROE."],
  weaknesses: [],
  opportunities: [],
  threats: [],
};

function makeJob(data: NarrativeBatchJobData): Job<NarrativeBatchJobData> {
  return {
    name: NARRATIVE_BATCH_JOB_NAME,
    data,
  } as unknown as Job<NarrativeBatchJobData>;
}

function makeDeps(overrides: {
  bundle?: NarrativeContextBundle;
  narrative?: () => Promise<unknown>;
  swot?: () => Promise<unknown>;
  upsertNarrative?: ReturnType<typeof vi.fn>;
  bustCache?: ReturnType<typeof vi.fn>;
}) {
  const bundle = overrides.bundle ?? baseBundle;
  const ai = {
    narrative:
      overrides.narrative ??
      vi.fn().mockResolvedValue({
        text: "ROE held at 13.7%.",
        citedSources: ["scoreInput.financials.roe"],
      }),
    swot:
      overrides.swot ??
      vi.fn().mockResolvedValue(swotPayload),
  } as unknown as AiService;
  const reports = {
    upsertNarrative:
      overrides.upsertNarrative ?? vi.fn().mockResolvedValue(undefined),
    bustCache: overrides.bustCache ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as ReportsService;
  const contextProvider = {
    forTicker: vi.fn().mockResolvedValue(bundle),
  } as unknown as NarrativeContextProvider;
  return { ai, reports, contextProvider };
}

describe("NarrativeBatchProcessor.process — happy path", () => {
  it("calls narrative + swot, upserts the payload, busts cache, returns ok", async () => {
    const { ai, reports, contextProvider } = makeDeps({});
    const processor = new NarrativeBatchProcessor(ai, reports, contextProvider);

    const result = await processor.process(
      makeJob({ ticker: "RELIANCE", dataVersionHash: "v1" }),
    );

    expect(ai.narrative).toHaveBeenCalledOnce();
    expect(ai.swot).toHaveBeenCalledOnce();
    expect(reports.upsertNarrative).toHaveBeenCalledOnce();
    const [ticker, payload] = vi.mocked(reports.upsertNarrative).mock.calls[0];
    expect(ticker).toBe("RELIANCE");
    expect(payload.dataVersionHash).toBe("v1");
    expect(payload.narrative.paragraph).toContain("ROE");
    expect(payload.narrative.auditPassed).toBe(true);
    expect(payload.swot.auditPassed).toBe(true);
    expect(reports.bustCache).toHaveBeenCalledWith("RELIANCE");
    expect(result).toEqual({
      ticker: "RELIANCE",
      ok: true,
      fallbackUsed: false,
    });
  });
});

describe("NarrativeBatchProcessor.process — stale-version drift", () => {
  it("returns { skipped: 'stale-version' } and never calls Gemini", async () => {
    const driftBundle: NarrativeContextBundle = {
      ...baseBundle,
      dataVersionHash: "v2",
    };
    const { ai, reports, contextProvider } = makeDeps({ bundle: driftBundle });
    const processor = new NarrativeBatchProcessor(ai, reports, contextProvider);

    const result = await processor.process(
      makeJob({ ticker: "RELIANCE", dataVersionHash: "v1" }),
    );

    expect(result).toEqual({ ticker: "RELIANCE", skipped: "stale-version" });
    expect(ai.narrative).not.toHaveBeenCalled();
    expect(ai.swot).not.toHaveBeenCalled();
    expect(reports.upsertNarrative).not.toHaveBeenCalled();
    expect(reports.bustCache).not.toHaveBeenCalled();
  });
});

describe("NarrativeBatchProcessor.process — fallback narrative", () => {
  it("emits the deterministic fallback when narrative audit is exhausted", async () => {
    const { ai, reports, contextProvider } = makeDeps({
      narrative: () =>
        Promise.reject(
          new NarrativeAuditFailedError(3, "audit failed after 3 attempts"),
        ),
    });
    const processor = new NarrativeBatchProcessor(ai, reports, contextProvider);

    const result = await processor.process(
      makeJob({ ticker: "RELIANCE", dataVersionHash: "v1" }),
    );

    expect(result).toEqual({
      ticker: "RELIANCE",
      ok: true,
      fallbackUsed: true,
    });
    const payload = vi.mocked(reports.upsertNarrative).mock.calls[0][1];
    expect(payload.narrative.paragraph).toBe(
      "FinSight Score: 7. Verdict: Strong Score.",
    );
    expect(payload.fallbackUsed).toBe(true);
  });

  it("emits empty SWOT quadrants when SWOT audit is exhausted", async () => {
    const { ai, reports, contextProvider } = makeDeps({
      swot: () =>
        Promise.reject(
          new NarrativeAuditFailedError(3, "swot audit failed"),
        ),
    });
    const processor = new NarrativeBatchProcessor(ai, reports, contextProvider);

    const result = await processor.process(
      makeJob({ ticker: "RELIANCE", dataVersionHash: "v1" }),
    );

    expect(result.ok).toBe(true);
    const payload = vi.mocked(reports.upsertNarrative).mock.calls[0][1];
    expect(payload.swot.strengths).toEqual([]);
    expect(payload.swot.weaknesses).toEqual([]);
    expect(payload.swot.opportunities).toEqual([]);
    expect(payload.swot.threats).toEqual([]);
  });
});

describe("NarrativeBatchProcessor.process — compliance violation", () => {
  it("rethrows ComplianceViolationException without substituting a fallback", async () => {
    const { ai, reports, contextProvider } = makeDeps({
      narrative: () =>
        Promise.reject(
          new ComplianceViolationException(["verb:buy/sell/hold/recommend"]),
        ),
    });
    const processor = new NarrativeBatchProcessor(ai, reports, contextProvider);

    await expect(
      processor.process(
        makeJob({ ticker: "RELIANCE", dataVersionHash: "v1" }),
      ),
    ).rejects.toBeInstanceOf(ComplianceViolationException);
    expect(reports.upsertNarrative).not.toHaveBeenCalled();
  });
});
