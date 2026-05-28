import { Inject, Injectable } from "@nestjs/common";
import type { ScoreResult } from "@finsight/shared";
import { CacheService } from "../cache/cache.service";
import { TTL } from "../cache/ttl-policy";

export const NARRATIVE_CLIENT = Symbol("NARRATIVE_CLIENT");

export interface NarrativeClient {
  generate(prompt: string): Promise<string>;
}

export interface NarrativeInput {
  readonly assetName: string;
  readonly assetType: "stock" | "fund";
  readonly cacheKey: string;
  readonly score: ScoreResult;
  readonly citations: readonly string[];
}

export type NarrativePromptInput = Omit<NarrativeInput, "cacheKey">;

@Injectable()
export class NarrativeService {
  constructor(
    private readonly cache: CacheService,
    @Inject(NARRATIVE_CLIENT) private readonly client: NarrativeClient,
  ) {}

  async getNarrative(input: NarrativeInput): Promise<string> {
    return this.cache.getOrSet(
      `gemini:narrative:${input.cacheKey}`,
      TTL.GEMINI_NARRATIVE,
      async () => {
        const narrative = (await this.client.generate(this.buildPrompt(input))).trim();
        if (!narrative) {
          throw new Error("NarrativeService: empty narrative");
        }
        return narrative;
      },
    );
  }

  buildPrompt(input: NarrativePromptInput): string {
    const cards = input.score.insightCards
      .map((card) => `- ${card.label}: ${card.score}/100, weight ${card.weight}`)
      .join("\n");
    const citations = input.citations.map((citation) => `- ${citation}`).join("\n");

    return [
      `Write a plain-English investment analysis for ${input.assetName} (${input.assetType}).`,
      `score: ${input.score.score}/10`,
      `verdict: ${input.score.verdict}`,
      "Do not change or invent numeric metrics. Use only the provided score, verdict, cards, and citations.",
      "Frame the output as analysis, not personalized financial advice.",
      "Insight cards:",
      cards,
      "Citations:",
      citations,
    ].join("\n");
  }
}
