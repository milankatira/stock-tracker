/**
 * Wave-0 spike (CHAT-01/CHAT-02) — verifies the @google/genai 2.6
 * streaming + function-calling interleave loop. Exploratory, NOT a test
 * and NOT a Nest module. Run it manually against a real key:
 *
 *   GEMINI_API_KEY=xxx npx tsx src/ai/__spikes__/streaming-tools.spike.ts
 *
 * Without a key it exits 0 with a notice (so it is safe to invoke in any
 * environment). The verified chunk shape is documented in README.md,
 * grounded in the installed 2.6 type definitions.
 */
import {
  GoogleGenAI,
  Type,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type GenerateContentResponse,
} from "@google/genai";

const MODEL = "gemini-2.5-flash";
const MAX_TOOL_TURNS = 5;

const scoreDecl: FunctionDeclaration = {
  name: "getInstrumentScore",
  description: "READ-ONLY — returns the persisted FinSight Score.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      symbolOrSchemeCode: { type: Type.STRING },
      type: { type: Type.STRING, enum: ["stock", "fund"] },
    },
    required: ["symbolOrSchemeCode", "type"],
  },
};

function fakeScoreResponse(): Record<string, unknown> {
  return {
    score: 7.2,
    verdict: "STRONG_SCORE",
    pillarBreakdown: { fundamentals: 8, valuation: 6 },
    asOfDate: "2026-05-28",
  };
}

async function run(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log(
      "[spike] GEMINI_API_KEY not set — skipping live run. See README.md for the SDK-grounded chunk transcript.",
    );
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const history: Content[] = [
    {
      role: "user",
      parts: [{ text: "What is the FinSight Score for RELIANCE?" }],
    },
  ];

  for (let turn = 1; turn <= MAX_TOOL_TURNS; turn += 1) {
    console.log(`\n=== tool turn ${turn} ===`);
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: history,
      config: {
        systemInstruction:
          "You are a research analyst. Use getInstrumentScore when asked about an instrument.",
        tools: [{ functionDeclarations: [scoreDecl] }],
      },
    });

    let text = "";
    const calls: FunctionCall[] = [];
    for await (const chunk of stream) {
      logChunk(chunk);
      if (chunk.text) text += chunk.text;
      if (chunk.functionCalls?.length) calls.push(...chunk.functionCalls);
    }

    if (calls.length === 0) {
      console.log(`\n[spike] final assistant text:\n${text}`);
      return;
    }

    // Append the model's function-call turn, then our function responses.
    history.push({
      role: "model",
      parts: calls.map((fc) => ({ functionCall: fc })),
    });
    history.push({
      role: "user",
      parts: calls.map((fc) => ({
        functionResponse: {
          name: fc.name ?? "unknown",
          response: fakeScoreResponse(),
        },
      })),
    });
  }
  console.log("[spike] hit MAX_TOOL_TURNS without a final text answer.");
}

function logChunk(chunk: GenerateContentResponse): void {
  const shape = {
    hasText: typeof chunk.text === "string",
    functionCalls: chunk.functionCalls?.map((c) => ({ name: c.name, args: c.args })),
  };
  console.log(JSON.stringify(shape, null, 2));
}

run().catch((err: unknown) => {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error("[spike] error:", { name: e.name, message: e.message });
  process.exitCode = 1;
});
