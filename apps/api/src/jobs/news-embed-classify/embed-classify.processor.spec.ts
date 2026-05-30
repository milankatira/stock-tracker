import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmbedClassifyProcessor } from "./embed-classify.processor";
import { NEWS_CLASSIFIED_EVENT } from "./embed-classify.queue";
import type { AiService } from "../../ai/ai.service";
import type { NewsService } from "../../news/news.service";
import type { NewsRepository } from "../../news/news.repository";
import type { EventEmitter2 } from "@nestjs/event-emitter";

const NEWS_ID = "60f7c2d5e1b2c30015a1b2c3";
const DIM = 768;

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    data: { newsId: NEWS_ID },
    opts: { attempts: 5 },
    attemptsMade: 0,
    ...overrides,
  } as never;
}

describe("EmbedClassifyProcessor", () => {
  let ai: AiService;
  let news: NewsService;
  let repo: NewsRepository;
  let events: EventEmitter2;
  let processor: EmbedClassifyProcessor;

  beforeEach(() => {
    ai = {
      embedForStorage: vi.fn().mockResolvedValue(Array.from({ length: DIM }, () => 0.01)),
      classifySentiment: vi.fn().mockResolvedValue({
        sentiment: "POSITIVE",
        confidence: 0.9,
        rationaleOneLine: "Profit rose.",
      }),
    } as unknown as AiService;
    news = {
      markEmbedded: vi.fn().mockResolvedValue(undefined),
      markClassified: vi.fn().mockResolvedValue(undefined),
    } as unknown as NewsService;
    repo = {
      findById: vi.fn(),
      markFailed: vi.fn().mockResolvedValue(undefined),
    } as unknown as NewsRepository;
    events = { emit: vi.fn() } as unknown as EventEmitter2;
    processor = new EmbedClassifyProcessor(ai, news, repo, events);
  });

  it("embeds, classifies, and emits news.classified for a pending doc", async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: "Tata Motors Q4 profit jumps 30%",
      description: "EV strength",
      embedding: undefined,
      sentiment: null,
      instrumentMentions: ["TATAMOTORS"],
    });

    await processor.process(makeJob());

    expect(ai.embedForStorage).toHaveBeenCalledOnce();
    expect(news.markEmbedded).toHaveBeenCalledWith(NEWS_ID, expect.any(Array), "gemini-embedding-001", "1");
    expect(ai.classifySentiment).toHaveBeenCalledOnce();
    expect(news.markClassified).toHaveBeenCalledWith(
      NEWS_ID,
      expect.objectContaining({ sentiment: "POSITIVE", classifierVersion: "1" }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      NEWS_CLASSIFIED_EVENT,
      expect.objectContaining({ newsId: NEWS_ID, instrumentMentions: ["TATAMOTORS"] }),
    );
  });

  it("does NOT re-embed when an embedding already exists", async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: "t",
      embedding: Array.from({ length: DIM }, () => 0.5),
      sentiment: null,
      instrumentMentions: ["INFY"],
    });

    await processor.process(makeJob());

    expect(ai.embedForStorage).not.toHaveBeenCalled();
    expect(ai.classifySentiment).toHaveBeenCalledOnce();
  });

  it("skips a doc that no longer exists", async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await processor.process(makeJob());

    expect(result).toEqual({ skipped: "missing" });
    expect(ai.embedForStorage).not.toHaveBeenCalled();
  });

  it("marks the doc failed on the final attempt instead of throwing", async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: "t",
      embedding: undefined,
      sentiment: null,
      instrumentMentions: ["INFY"],
    });
    (ai.embedForStorage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("429"));

    const result = await processor.process(makeJob({ attemptsMade: 4, opts: { attempts: 5 } }));

    expect(result).toEqual({ failed: true });
    expect(repo.markFailed).toHaveBeenCalledWith(NEWS_ID);
  });

  it("rethrows on a non-final attempt so BullMQ retries", async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: "t",
      embedding: undefined,
      sentiment: null,
      instrumentMentions: ["INFY"],
    });
    (ai.embedForStorage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("429"));

    await expect(
      processor.process(makeJob({ attemptsMade: 0, opts: { attempts: 5 } })),
    ).rejects.toThrow("429");
    expect(repo.markFailed).not.toHaveBeenCalled();
  });
});
