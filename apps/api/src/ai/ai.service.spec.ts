import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AiService,
  type NarrativeContext,
} from "./ai.service";
import { NarrativeAuditFailedError } from "./ai.types";
import type { GeminiClient } from "./gemini.client";
import type { ToolRegistry } from "./tools/tools.registry";

const STUB_TOOLS: ToolRegistry = {
  declarations: [],
  execute: () => Promise.reject(new Error("unused")),
};

function makeGemini(responses: readonly string[]): GeminiClient {
  let index = 0;
  return {
    genai: {
      models: {
        generateContent: vi.fn(async () => {
          const text = responses[Math.min(index, responses.length - 1)];
          index += 1;
          return { text };
        }),
      },
    },
  } as unknown as GeminiClient;
}

const context: NarrativeContext = {
  score: 7,
  verdict: "CAUTION",
  verifiedValues: { roe: "13.7%", pe: "24" },
  userPrompt: "Summarise the fundamentals.",
};

describe("AiService.narrative — happy path", () => {
  let service: AiService;
  let gemini: GeminiClient;

  beforeEach(() => {
    gemini = makeGemini([
      JSON.stringify({
        paragraph: "ROE held at {{roe}} while P/E sat near {{pe}}.",
        placeholders: ["roe", "pe"],
        citedSources: ["scoreInput.financials.roe", "scoreInput.financials.pe"],
      }),
    ]);
    service = new AiService(gemini, STUB_TOOLS);
  });

  it("substitutes verified placeholders into the paragraph", async () => {
    const result = await service.narrative(context);
    expect(result.text).toBe("ROE held at 13.7% while P/E sat near 24.");
    expect(result.auditPassed).toBe(true);
    expect(result.citedSources).toEqual([
      "scoreInput.financials.roe",
      "scoreInput.financials.pe",
    ]);
  });
});

describe("AiService.narrative — retry loop", () => {
  it("retries when an unknown placeholder is encountered, then succeeds", async () => {
    const gemini = makeGemini([
      JSON.stringify({
        paragraph: "ROE held at {{missing}}.",
        placeholders: ["missing"],
        citedSources: [],
      }),
      JSON.stringify({
        paragraph: "ROE held at {{roe}}.",
        placeholders: ["roe"],
        citedSources: ["scoreInput.financials.roe"],
      }),
    ]);
    const service = new AiService(gemini, STUB_TOOLS);

    const result = await service.narrative(context, 3);
    expect(result.text).toBe("ROE held at 13.7%.");
  });

  it("retries when the audit detects an invented number, then succeeds", async () => {
    const gemini = makeGemini([
      JSON.stringify({
        paragraph: "ROE near 14% reflected discipline.",
        placeholders: [],
        citedSources: [],
      }),
      JSON.stringify({
        paragraph: "ROE held at {{roe}}.",
        placeholders: ["roe"],
        citedSources: ["scoreInput.financials.roe"],
      }),
    ]);
    const service = new AiService(gemini, STUB_TOOLS);

    const result = await service.narrative(context, 3);
    expect(result.text).toBe("ROE held at 13.7%.");
  });

  it("throws NarrativeAuditFailedError when the retry budget is exhausted", async () => {
    const gemini = makeGemini([
      JSON.stringify({
        paragraph: "ROE near 14% reflected discipline.",
        placeholders: [],
        citedSources: [],
      }),
      JSON.stringify({
        paragraph: "ROE held at {{missing}}.",
        placeholders: ["missing"],
        citedSources: [],
      }),
      JSON.stringify({
        paragraph: "ROE was around 15.4% this year.",
        placeholders: [],
        citedSources: [],
      }),
    ]);
    const service = new AiService(gemini, STUB_TOOLS);

    await expect(service.narrative(context, 3)).rejects.toBeInstanceOf(
      NarrativeAuditFailedError,
    );
  });

  it("rethrows non-placeholder errors immediately", async () => {
    const gemini = {
      genai: {
        models: {
          generateContent: vi.fn().mockRejectedValue(new Error("API down")),
        },
      },
    } as unknown as GeminiClient;
    const service = new AiService(gemini, STUB_TOOLS);

    await expect(service.narrative(context, 3)).rejects.toThrow("API down");
  });
});

describe("AiService.swot", () => {
  it("audits joined bullets and substitutes placeholders", async () => {
    const gemini = makeGemini([
      JSON.stringify({
        strengths: ["ROE of {{roe}} leads the cohort."],
        weaknesses: ["P/E of {{pe}} above sector median."],
        opportunities: [],
        threats: [],
        citedSources: ["scoreInput.financials.roe", "scoreInput.financials.pe"],
      }),
    ]);
    const service = new AiService(gemini, STUB_TOOLS);

    const result = await service.swot(context);
    expect(result.text).toContain("13.7%");
    expect(result.text).toContain("24");
  });

  it("falls back to NarrativeAuditFailedError when SWOT cannot pass the audit", async () => {
    const gemini = makeGemini([
      JSON.stringify({
        strengths: ["ROE of 14% leads the cohort."],
        weaknesses: [],
        opportunities: [],
        threats: [],
        citedSources: [],
      }),
    ]);
    const service = new AiService(gemini, STUB_TOOLS);

    await expect(service.swot(context, 1)).rejects.toBeInstanceOf(
      NarrativeAuditFailedError,
    );
  });
});
