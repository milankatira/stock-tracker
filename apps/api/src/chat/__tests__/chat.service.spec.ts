import { describe, expect, it, vi } from "vitest";
import type { MessageEvent } from "@nestjs/common";
import { ChatService, type StreamReplyOpts } from "../chat.service";
import type { AiService, ChatStreamOpts } from "../../ai/ai.service";
import { RefusalDetector } from "../../ai/refusal/refusal-detector";
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
  scope: { type: "stock", symbols: ["RELIANCE"] },
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

function makeService(
  aiChatStream: (opts: ChatStreamOpts) => Promise<void>,
  refusal: RefusalCategory | null = null,
): ChatService {
  const ai = { chatStream: vi.fn(aiChatStream) } as unknown as AiService;
  const detector = { classify: vi.fn().mockReturnValue(refusal) } as unknown as RefusalDetector;
  const stub = {} as unknown;
  return new ChatService(
    ai,
    detector,
    stub as ReportsService,
    stub as FundReportsService,
    stub as NewsService,
    stub as SearchService,
  );
}

describe("ChatService.streamReply", () => {
  it("short-circuits to a refusal event without calling Gemini", async () => {
    const chatStream = vi.fn().mockResolvedValue(undefined);
    const ai = { chatStream } as unknown as AiService;
    const detector = {
      classify: vi.fn().mockReturnValue(RefusalCategory.OUT_OF_SCOPE_GEO),
    } as unknown as RefusalDetector;
    const stub = {} as unknown;
    const svc = new ChatService(
      ai,
      detector,
      stub as ReportsService,
      stub as FundReportsService,
      stub as NewsService,
      stub as SearchService,
    );

    const events = await collect(svc, OPTS);

    expect(chatStream).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("refusal");
    expect(JSON.parse(events[0]!.data as string).category).toBe("OUT_OF_SCOPE_GEO");
  });

  it("maps chatStream callbacks to token/tool/done events", async () => {
    const svc = makeService(async (o) => {
      o.onToolStart("getInstrumentScore");
      o.onToolEnd("getInstrumentScore", {
        sourceTag: "score:stock:RELIANCE",
        asOfDate: new Date("2026-05-28T00:00:00.000Z"),
      });
      o.onSafeChunk("Reliance has a Strong Score.");
      await o.onComplete("Reliance has a Strong Score.", [
        { sourceTag: "score:stock:RELIANCE", asOfDate: new Date("2026-05-28T00:00:00.000Z") },
      ]);
    });

    const events = await collect(svc, OPTS);
    const types = events.map((e) => e.type);

    expect(types).toEqual(["tool_start", "tool_end", "token", "done"]);
    expect(events[2]!.data).toBe("Reliance has a Strong Score.");
    const done = JSON.parse(events[3]!.data as string);
    expect(done.citations).toHaveLength(1);
    expect(done.citations[0].sourceTag).toBe("score:stock:RELIANCE");
  });

  it("maps an in-stream onRefusal to a refusal event", async () => {
    const svc = makeService(async (o) => {
      o.onRefusal(RefusalCategory.TOOL_LIMIT_EXCEEDED);
    });

    const events = await collect(svc, OPTS);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("refusal");
    expect(JSON.parse(events[0]!.data as string).category).toBe("TOOL_LIMIT_EXCEEDED");
  });

  it("emits an error event when chatStream throws", async () => {
    const svc = makeService(() => Promise.reject(new Error("boom")));
    const events = await collect(svc, OPTS);
    expect(events.at(-1)!.type).toBe("error");
  });
});
