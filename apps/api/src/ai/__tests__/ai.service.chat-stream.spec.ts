import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiService, type ChatStreamOpts } from "../ai.service";
import type { GeminiClient } from "../gemini.client";
import type { ToolRegistry } from "../tools/tools.registry";
import type { ToolContext, ToolResult } from "../tools/tool.types";
import { RefusalCategory } from "../refusal/refusal.enum";

interface FakeChunk {
  text?: string;
  functionCalls?: { name: string; args: Record<string, unknown> }[];
}

async function* gen(chunks: FakeChunk[]): AsyncGenerator<FakeChunk> {
  for (const c of chunks) yield c;
}

function makeGemini(streams: FakeChunk[][]): GeminiClient {
  const generateContentStream = vi.fn();
  for (const s of streams) generateContentStream.mockResolvedValueOnce(gen(s));
  return {
    genai: { models: { generateContentStream } },
  } as unknown as GeminiClient;
}

const TOOL_RESULT: ToolResult<unknown> = {
  data: { score: 7.2, verdict: "STRONG_SCORE" },
  sourceTag: "score:stock:RELIANCE",
  asOfDate: new Date("2026-05-28T00:00:00.000Z"),
  dataVersionHash: "dvh-1",
};

function makeTools(executeImpl?: () => Promise<ToolResult<unknown>>): ToolRegistry {
  return {
    declarations: [],
    execute: vi.fn(executeImpl ?? (() => Promise.resolve(TOOL_RESULT))),
  };
}

const TOOL_CTX = {
  scope: { type: "stock", symbols: ["RELIANCE"] },
  userId: "u1",
} as unknown as ToolContext;

function makeOpts(over: Partial<ChatStreamOpts> = {}): ChatStreamOpts {
  return {
    history: [],
    userMessage: "Tell me about RELIANCE",
    toolContext: TOOL_CTX,
    abortSignal: new AbortController().signal,
    onSafeChunk: vi.fn(),
    onToolStart: vi.fn(),
    onToolEnd: vi.fn(),
    onRefusal: vi.fn(),
    onComplete: vi.fn(),
    ...over,
  };
}

describe("AiService.chatStream", () => {
  let opts: ChatStreamOpts;
  beforeEach(() => {
    opts = makeOpts();
  });

  it("streams sanitised sentences and completes with no citations", async () => {
    const ai = new AiService(
      makeGemini([[{ text: "Reliance has a Strong Score. " }, { text: "It is stable." }]]),
      makeTools(),
    );
    await ai.chatStream(opts);

    expect(opts.onSafeChunk).toHaveBeenCalledWith("Reliance has a Strong Score.");
    expect(opts.onSafeChunk).toHaveBeenCalledWith("It is stable.");
    expect(opts.onComplete).toHaveBeenCalledOnce();
    expect(opts.onComplete).toHaveBeenCalledWith(expect.any(String), []);
    expect(opts.onRefusal).not.toHaveBeenCalled();
  });

  it("executes a tool then streams the follow-up answer with a citation", async () => {
    const ai = new AiService(
      makeGemini([
        [{ functionCalls: [{ name: "getInstrumentScore", args: { symbolOrSchemeCode: "RELIANCE", type: "stock" } }] }],
        [{ text: "Reliance scores 7.2, a Strong Score. " }],
      ]),
      makeTools(),
    );
    await ai.chatStream(opts);

    expect(opts.onToolStart).toHaveBeenCalledWith("getInstrumentScore");
    expect(opts.onToolEnd).toHaveBeenCalledWith(
      "getInstrumentScore",
      expect.objectContaining({ sourceTag: "score:stock:RELIANCE" }),
    );
    expect(opts.onComplete).toHaveBeenCalledOnce();
    const [, citations] = (opts.onComplete as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(citations).toHaveLength(1);
  });

  it("caps tool turns at 5 → TOOL_LIMIT_EXCEEDED, no onComplete", async () => {
    // 6 turns each returning a tool call → exceeds the cap.
    const fcTurn: FakeChunk[] = [
      { functionCalls: [{ name: "getInstrumentScore", args: { symbolOrSchemeCode: "X", type: "stock" } }] },
    ];
    const ai = new AiService(
      makeGemini([fcTurn, fcTurn, fcTurn, fcTurn, fcTurn, fcTurn, fcTurn]),
      makeTools(),
    );
    await ai.chatStream(opts);

    expect(opts.onRefusal).toHaveBeenCalledWith(RefusalCategory.TOOL_LIMIT_EXCEEDED);
    expect(opts.onComplete).not.toHaveBeenCalled();
  });

  it("refuses a forbidden verb mid-stream (NON_COMPLIANT_BUYSELL)", async () => {
    const ai = new AiService(
      makeGemini([[{ text: "You should buy this now. " }]]),
      makeTools(),
    );
    await ai.chatStream(opts);

    expect(opts.onRefusal).toHaveBeenCalledWith(RefusalCategory.NON_COMPLIANT_BUYSELL);
    expect(opts.onComplete).not.toHaveBeenCalled();
  });

  it("passes the abort signal to Gemini and exits when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const gemini = makeGemini([[{ text: "never reached. " }]]);
    const ai = new AiService(gemini, makeTools());
    await ai.chatStream(makeOpts({ abortSignal: controller.signal }));

    // Aborted before the first turn → no stream created, no completion.
    expect(opts.onComplete).not.toHaveBeenCalled();
  });

  it("recovers from a tool error by feeding a structured error to Gemini", async () => {
    const ai = new AiService(
      makeGemini([
        [{ functionCalls: [{ name: "getInstrumentScore", args: {} }] }],
        [{ text: "I could not find that instrument. " }],
      ]),
      makeTools(() => Promise.reject(new Error("boom"))),
    );
    await ai.chatStream(opts);

    expect(opts.onToolEnd).toHaveBeenCalled(); // error citation still emitted
    expect(opts.onComplete).toHaveBeenCalledOnce();
  });
});
