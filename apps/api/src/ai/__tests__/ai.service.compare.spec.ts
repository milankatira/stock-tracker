import { describe, expect, it, vi } from "vitest";
import { AiService } from "../ai.service";
import type { GeminiClient } from "../gemini.client";
import type { ToolRegistry } from "../tools/tools.registry";
import type { CompareScoreContext } from "../prompts/compare-system.prompt";

const STUB_TOOLS: ToolRegistry = {
  declarations: [],
  execute: vi.fn(),
};

/**
 * Build a GeminiClient whose `generateContent` returns a canned structured
 * JSON string — exactly the shape `compare()` parses. The pre-loaded score
 * contexts are supplied by the caller (Option B: CompareService owns score
 * loading), so these tests never touch a repo.
 */
function makeGemini(jsonText: string): GeminiClient {
  return {
    genai: {
      models: {
        generateContent: vi.fn().mockResolvedValue({ text: jsonText }),
      },
    },
  } as unknown as GeminiClient;
}

function scoreCtx(
  symbol: string,
  value: number,
  verdict: string,
): CompareScoreContext {
  return {
    symbol,
    value,
    verdict,
    pillars: { fundamentals: value, valuation: value },
    asOfDate: "2026-06-01T00:00:00.000Z",
  };
}

describe("AiService.compare", () => {
  it("returns the structured verdict for 2 symbols with the higher-scoring winner", async () => {
    const gemini = makeGemini(
      JSON.stringify({
        winnerSymbol: "RELIANCE.NS",
        rationale: "RELIANCE.NS shows stronger fundamentals than TCS.NS.",
        scoreDelta: 1.5,
      }),
    );
    const service = new AiService(gemini, STUB_TOOLS);

    const result = await service.compare([
      scoreCtx("RELIANCE.NS", 8.0, "STRONG_SCORE"),
      scoreCtx("TCS.NS", 6.5, "CAUTION"),
    ]);

    expect(result.winnerSymbol).toBe("RELIANCE.NS");
    expect(result.scoreDelta).toBe(1.5);
    expect(result.rationale).toContain("RELIANCE.NS");
    expect(result.scores).toHaveLength(2);
    expect(result.scores[0]).toMatchObject({
      symbol: "RELIANCE.NS",
      value: 8.0,
      verdict: "STRONG_SCORE",
      asOfDate: "2026-06-01T00:00:00.000Z",
    });
  });

  it("handles 3 symbols and identifies the winner against the next-best", async () => {
    const gemini = makeGemini(
      JSON.stringify({
        winnerSymbol: "INFY.NS",
        rationale: "INFY.NS leads on the analysis of valuation and fundamentals.",
        scoreDelta: 0.4,
      }),
    );
    const service = new AiService(gemini, STUB_TOOLS);

    const result = await service.compare([
      scoreCtx("INFY.NS", 7.8, "STRONG_SCORE"),
      scoreCtx("TCS.NS", 7.4, "STRONG_SCORE"),
      scoreCtx("WIPRO.NS", 5.0, "WEAK_SCORE"),
    ]);

    expect(result.winnerSymbol).toBe("INFY.NS");
    // delta is winner (7.8) - max(other) (7.4) = 0.4
    expect(result.scoreDelta).toBe(0.4);
    expect(result.scores).toHaveLength(3);
  });

  it("throws when fewer than 2 scores are supplied", async () => {
    const service = new AiService(makeGemini("{}"), STUB_TOOLS);
    await expect(
      service.compare([scoreCtx("RELIANCE.NS", 8, "STRONG_SCORE")]),
    ).rejects.toThrow(/2_to_3/);
  });

  it("throws compare_winner_not_in_inputs when Gemini names a symbol outside the input set", async () => {
    const gemini = makeGemini(
      JSON.stringify({
        winnerSymbol: "MSFT",
        rationale: "MSFT looks strong.",
        scoreDelta: 2,
      }),
    );
    const service = new AiService(gemini, STUB_TOOLS);

    await expect(
      service.compare([
        scoreCtx("RELIANCE.NS", 8, "STRONG_SCORE"),
        scoreCtx("TCS.NS", 6, "CAUTION"),
      ]),
    ).rejects.toThrow(/compare_winner_not_in_inputs/);
  });

  it("sanitises the rationale through the same forbidden-verb pipeline as chat", async () => {
    const gemini = makeGemini(
      JSON.stringify({
        winnerSymbol: "RELIANCE.NS",
        rationale: "We recommend RELIANCE.NS — you should buy it now.",
        scoreDelta: 1,
      }),
    );
    const service = new AiService(gemini, STUB_TOOLS);

    const result = await service.compare([
      scoreCtx("RELIANCE.NS", 8, "STRONG_SCORE"),
      scoreCtx("TCS.NS", 7, "CAUTION"),
    ]);

    // applyReplacements rewrites "we recommend" / "you should buy" → SEBI-safe phrasing.
    expect(result.rationale.toLowerCase()).not.toContain("recommend");
    expect(/\byou should buy\b/i.test(result.rationale)).toBe(false);
  });

  it("overrides Gemini's scoreDelta with the deterministic server computation (AI invariant)", async () => {
    const gemini = makeGemini(
      JSON.stringify({
        winnerSymbol: "RELIANCE.NS",
        rationale: "RELIANCE.NS edges ahead on fundamentals.",
        scoreDelta: 999, // hallucinated — must be discarded
      }),
    );
    const service = new AiService(gemini, STUB_TOOLS);

    const result = await service.compare([
      scoreCtx("RELIANCE.NS", 8.2, "STRONG_SCORE"),
      scoreCtx("TCS.NS", 6.7, "CAUTION"),
    ]);

    // server-computed: 8.2 - 6.7 = 1.5 (NOT 999)
    expect(result.scoreDelta).toBe(1.5);
  });
});
