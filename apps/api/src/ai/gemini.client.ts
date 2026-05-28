import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI } from "@google/genai";

/**
 * Private Gemini client. Lives inside `AIModule` as a provider but is
 * deliberately **not** exported — only `AiService` may consume it.
 * Combined with the `no-restricted-imports` ESLint fence in
 * `eslint.config.mjs`, this enforces the COMP-02 single-chokepoint
 * contract by construction.
 *
 * Fails loud on missing `GEMINI_API_KEY` so deploys never quietly
 * ship a broken AI surface.
 */
@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  readonly genai: GoogleGenAI;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("GEMINI_API_KEY");
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        "GEMINI_API_KEY is not configured — refusing to initialise GeminiClient",
      );
    }
    this.genai = new GoogleGenAI({ apiKey });
    this.logger.log("GeminiClient initialised (private to AIModule)");
  }
}
