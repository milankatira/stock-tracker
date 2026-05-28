import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI } from "@google/genai";
import type { GenerateContentResponse, GoogleGenAI as GoogleGenAIClient } from "@google/genai";
import type { NarrativeClient } from "./narrative.service";

export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";

@Injectable()
export class GeminiNarrativeClient implements NarrativeClient {
  private readonly client: GoogleGenAIClient;

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({
      apiKey: config.getOrThrow<string>("GEMINI_API_KEY"),
    });
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.generateContent(prompt);
    const text = response.text?.trim();

    if (!text) {
      throw new Error("GeminiNarrativeClient: empty response text");
    }

    return text;
  }

  private async generateContent(prompt: string): Promise<GenerateContentResponse> {
    try {
      return await this.client.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: prompt,
      });
    } catch (error) {
      throw new Error("GeminiNarrativeClient: generation failed", { cause: error });
    }
  }
}
