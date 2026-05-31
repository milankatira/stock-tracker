import { describe, expect, it, vi } from "vitest";
import type { MessageEvent } from "@nestjs/common";
import { ChatService, type StreamReplyOpts } from "../chat.service";
import type { AiService, ChatStreamOpts } from "../../ai/ai.service";
import type { RefusalDetector } from "../../ai/refusal/refusal-detector";
import type { ChatSessionRepo } from "../chat-session.repo";
import { RefusalCategory } from "../../ai/refusal/refusal.enum";
import type { ReportsService } from "../../reports/reports.service";
import type { FundReportsService } from "../../reports/fund-reports.service";
import type { NewsService } from "../../news/news.service";
import type { SearchService } from "../../search/search.service";

const OPTS: StreamReplyOpts = {
  sessionId: "s1",
  userId: "u1",
  content: "Tell me about RELIANCE",
  messageId: "m1",
};

function collect(svc: ChatService, opts: StreamReplyOpts): Promise<MessageEvent[]> {
  return new Promise((resolve) => {
    const events: MessageEvent[] = [];
    svc.streamReply(opts).subscribe({
      next: (e) => events.push(e),
      complete: () => resolve(events),
    });
  });
}

interface Mocks {
  chatStream: ReturnType<typeof vi.fn>;
  findMessage: ReturnType<typeof vi.fn>;
  classify: ReturnType<typeof vi.fn>;
  appendUser: ReturnType<typeof vi.fn>;
  appendAssistant: ReturnType<typeof vi.fn>;
  appendRefusal: ReturnType<typeof vi.fn>;
}

function makeService(
  over: {
    aiChatStream?: (o: ChatStreamOpts) => Promise<void>;
    refusal?: RefusalCategory | null;
    existing?: { content: string; citations: unknown[]; refusalCategory?: RefusalCategory } | null;
  } = {},
): { svc: ChatService; mocks: Mocks } {
  const mocks: Mocks = {
    chatStream: vi.fn(over.aiChatStream ?? (() => Promise.resolve())),
    findMessage: vi.fn().mockResolvedValue(over.existing ?? null),
    classify: vi.fn().mockReturnValue(over.refusal ?? null),
    appendUser: vi.fn().mockResolvedValue(undefined),
    appendAssistant: vi.fn().mockResolvedValue(undefined),
    appendRefusal: vi.fn().mockResolvedValue(undefined),
  };
  const ai = { chatStream: mocks.chatStream } as unknown as AiService;
  const detector = { classify: mocks.classify } as unknown as RefusalDetector;
  const sessions = {
    findMessage: mocks.findMessage,
    appendUser: mocks.appendUser,
    appendAssistant: mocks.appendAssistant,
    appendRefusal: mocks.appendRefusal,
    loadHistory: vi.fn().mockResolvedValue([]),
    getScope: vi.fn().mockResolvedValue({ type: "stock", symbols: ["RELIANCE"] }),
  } as unknown as ChatSessionRepo;
  const stub = {} as unknown;
  const svc = new ChatService(
    ai,
    detector,
    sessions,
    stub as ReportsService,
    stub as FundReportsService,
    stub as NewsService,
    stub as SearchService,
  );
  return { svc, mocks };
}

describe("ChatService.streamReply (persistence)", () => {
  it("replays a persisted reply on idempotent reconnect — no Gemini call", async () => {
    const { svc, mocks } = makeService({
      existing: { content: "cached reply", citations: [] },
    });
    const events = await collect(svc, OPTS);

    expect(mocks.chatStream).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("replay");
    expect(JSON.parse(events[0]!.data as string).content).toBe("cached reply");
  });

  it("persists user + refusal and emits a refusal on a pre-stream block", async () => {
    const { svc, mocks } = makeService({ refusal: RefusalCategory.OUT_OF_SCOPE_GEO });
    const events = await collect(svc, OPTS);

    expect(mocks.chatStream).not.toHaveBeenCalled();
    expect(mocks.appendUser).toHaveBeenCalledWith("s1", "m1", OPTS.content);
    expect(mocks.appendRefusal).toHaveBeenCalledWith("s1", "m1", RefusalCategory.OUT_OF_SCOPE_GEO);
    expect(events[0]!.type).toBe("refusal");
  });

  it("persists the user msg, streams tokens, validates citations, persists assistant", async () => {
    const { svc, mocks } = makeService({
      aiChatStream: async (o) => {
        o.onToolEnd(
          "getInstrumentScore",
          { sourceTag: "score:stock:RELIANCE", asOfDate: new Date("2026-05-28") },
          { score: 7.2 },
        );
        o.onSafeChunk("The score is 7.2.");
        await o.onComplete("The score is 7.2.", [
          { sourceTag: "score:stock:RELIANCE", asOfDate: new Date("2026-05-28") },
        ]);
      },
    });
    const events = await collect(svc, OPTS);
    const types = events.map((e) => e.type);

    expect(mocks.appendUser).toHaveBeenCalledWith("s1", "m1", OPTS.content);
    expect(types).toEqual(["tool_end", "token", "done"]);
    // 7.2 is cited by the tool data → no citation_missing, assistant persisted without refusal.
    expect(mocks.appendAssistant).toHaveBeenCalledWith(
      "s1",
      "m1",
      "The score is 7.2.",
      expect.any(Array),
      undefined,
    );
  });

  it("emits citation_missing + persists CITATION_MISSING when a number is uncited", async () => {
    const { svc, mocks } = makeService({
      aiChatStream: async (o) => {
        o.onSafeChunk("The score is 99%.");
        await o.onComplete("The score is 99%.", []);
      },
    });
    const events = await collect(svc, OPTS);
    const types = events.map((e) => e.type);

    expect(types).toContain("citation_missing");
    const cm = events.find((e) => e.type === "citation_missing")!;
    expect(JSON.parse(cm.data as string).missing).toContain("99%");
    expect(mocks.appendAssistant).toHaveBeenCalledWith(
      "s1",
      "m1",
      "The score is 99%.",
      expect.any(Array),
      RefusalCategory.CITATION_MISSING,
    );
  });
});
