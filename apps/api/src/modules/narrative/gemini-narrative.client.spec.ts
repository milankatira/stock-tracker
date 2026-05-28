import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GEMINI_TEXT_MODEL, GeminiNarrativeClient } from "./gemini-narrative.client";

const { generateContent, googleGenAI } = vi.hoisted(() => ({
  generateContent: vi.fn(),
  googleGenAI: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: googleGenAI,
}));

describe("GeminiNarrativeClient", () => {
  beforeEach(() => {
    generateContent.mockReset();
    googleGenAI.mockReset();
    googleGenAI.mockReturnValue({
      models: {
        generateContent,
      },
    });
  });

  it("uses the configured Gemini API key and text model", async () => {
    generateContent.mockResolvedValue({ text: "  Stable narrative  " });
    const client = new GeminiNarrativeClient(
      new ConfigService({ GEMINI_API_KEY: "test-gemini-key" }),
    );

    await expect(client.generate("prompt text")).resolves.toBe("Stable narrative");

    expect(googleGenAI).toHaveBeenCalledWith({ apiKey: "test-gemini-key" });
    expect(generateContent).toHaveBeenCalledWith({
      model: GEMINI_TEXT_MODEL,
      contents: "prompt text",
    });
  });

  it("rejects empty Gemini text", async () => {
    generateContent.mockResolvedValue({ text: "   " });
    const client = new GeminiNarrativeClient(
      new ConfigService({ GEMINI_API_KEY: "test-gemini-key" }),
    );

    await expect(client.generate("prompt text")).rejects.toThrow(
      "GeminiNarrativeClient: empty response text",
    );
  });

  it("wraps provider failures with client context", async () => {
    const providerError = new Error("quota exceeded");
    generateContent.mockRejectedValue(providerError);
    const client = new GeminiNarrativeClient(
      new ConfigService({ GEMINI_API_KEY: "test-gemini-key" }),
    );

    await expect(client.generate("prompt text")).rejects.toMatchObject({
      message: "GeminiNarrativeClient: generation failed",
      cause: providerError,
    });
  });
});
