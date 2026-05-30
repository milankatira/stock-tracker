import { describe, expect, it, vi } from "vitest";
import { AiService } from "./ai.service";
import type { GeminiClient } from "./gemini.client";
import { NEWS_EMBEDDING_DIM } from "../news/vector/vector-index.constants";

function makeGemini(opts: {
  generateText?: string;
  embedding?: number[] | undefined;
}): GeminiClient {
  return {
    genai: {
      models: {
        generateContent: vi.fn().mockResolvedValue({ text: opts.generateText }),
        embedContent: vi.fn().mockResolvedValue({
          embeddings:
            opts.embedding === undefined ? undefined : [{ values: opts.embedding }],
        }),
      },
    },
  } as unknown as GeminiClient;
}

describe("AiService.classifySentiment", () => {
  it("returns the enum label + confidence and preserves a clean rationale", async () => {
    const gemini = makeGemini({
      generateText: JSON.stringify({
        sentiment: "POSITIVE",
        confidence: 0.9,
        rationaleOneLine: "Quarterly profit rose on strong EV demand.",
      }),
    });
    const service = new AiService(gemini);

    const result = await service.classifySentiment("Tata Motors Q4 profit jumps");

    expect(result.sentiment).toBe("POSITIVE");
    expect(result.confidence).toBe(0.9);
    expect(result.rationaleOneLine).toBe(
      "Quarterly profit rose on strong EV demand.",
    );
  });

  it("drops the rationale to null when it contains a forbidden verb (compliance)", async () => {
    const gemini = makeGemini({
      generateText: JSON.stringify({
        sentiment: "POSITIVE",
        confidence: 0.8,
        rationaleOneLine: "Strong BUY signal on Tata Motors.",
      }),
    });
    const service = new AiService(gemini);

    const result = await service.classifySentiment("Tata Motors rallies");

    // Label is enum-constrained and safe; the non-compliant free text is dropped.
    expect(result.sentiment).toBe("POSITIVE");
    expect(result.rationaleOneLine).toBeNull();
  });
});

describe("AiService.embedForStorage", () => {
  it("returns a vector of the configured dimension", async () => {
    const vec = Array.from({ length: NEWS_EMBEDDING_DIM }, () => 0.01);
    const service = new AiService(makeGemini({ embedding: vec }));

    const result = await service.embedForStorage("Tata Motors profit jumps 30%");

    expect(result).toHaveLength(NEWS_EMBEDDING_DIM);
  });

  it("throws on a dimension mismatch (second line of defence after boot assert)", async () => {
    const service = new AiService(makeGemini({ embedding: [0.1, 0.2, 0.3] }));

    await expect(service.embedForStorage("short vector")).rejects.toThrow(
      /dim mismatch/i,
    );
  });

  it("throws when the SDK returns no embedding", async () => {
    const service = new AiService(makeGemini({ embedding: undefined }));

    await expect(service.embedForStorage("no embedding")).rejects.toThrow(
      /dim mismatch/i,
    );
  });
});
