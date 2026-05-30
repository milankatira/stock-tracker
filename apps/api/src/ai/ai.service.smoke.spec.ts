import { describe, expect, it, beforeAll } from "vitest";
import { ConfigService } from "@nestjs/config";
import { AiService } from "./ai.service";
import { GeminiClient } from "./gemini.client";
import { NEWS_EMBEDDING_DIM } from "../news/vector/vector-index.constants";
import { sanitiseAndCheck } from "../compliance/compliance.sanitiser";

/**
 * Live-Gemini smoke tests (NEWS-02 / NEWS-03). Skipped by default —
 * runs only with `RUN_LIVE_SMOKE=1` and a real `GEMINI_API_KEY` so CI
 * never burns credits on every PR. Confirms the embedding dimension and
 * the sentiment round-trip against a canary headline.
 */
describe.skipIf(process.env.RUN_LIVE_SMOKE !== "1")("AiService (live Gemini smoke)", () => {
  let service: AiService;

  beforeAll(() => {
    const config = new ConfigService({ GEMINI_API_KEY: process.env.GEMINI_API_KEY });
    service = new AiService(new GeminiClient(config));
  });

  it("embeds a document at 768 dimensions", async () => {
    const vec = await service.embedForStorage("Tata Motors profit jumps 30%");
    expect(vec).toHaveLength(NEWS_EMBEDDING_DIM);
    expect(vec.every((n) => typeof n === "number")).toBe(true);
  });

  it("classifies a clearly-positive headline as POSITIVE with a clean rationale", async () => {
    const result = await service.classifySentiment(
      "Tata Motors Q4 profit jumps 30% on EV strength",
    );
    expect(result.sentiment).toBe("POSITIVE");
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    if (result.rationaleOneLine) {
      expect(sanitiseAndCheck(result.rationaleOneLine).violations).toHaveLength(0);
    }
  });
});
