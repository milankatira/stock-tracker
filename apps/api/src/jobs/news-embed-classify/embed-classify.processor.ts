import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Job } from "bullmq";
import { AiService } from "../../ai/ai.service";
import { NewsRepository } from "../../news/news.repository";
import { NewsService } from "../../news/news.service";
import {
  EMBEDDING_VERSION,
  EmbedClassifyJobData,
  GEMINI_CLASSIFIER_VERSION,
  NEWS_CLASSIFIED_EVENT,
  NEWS_EMBED_CLASSIFY_QUEUE_NAME,
  type NewsClassifiedEvent,
} from "./embed-classify.queue";

const EMBEDDING_MODEL = "gemini-embedding-001";
const CLASSIFIER_MODEL = "gemini-2.5-flash-lite";

/**
 * Per-article embed + classify worker (NEWS-02, NEWS-03). Enqueued by
 * the news-poll `process-article` step only on a NEW insert (never on a
 * dedup hit — re-embedding existing articles would burn Gemini spend).
 *
 * Pipeline per article:
 *   1. load the doc (skip if gone / already done);
 *   2. embed (768 dims) if `embedding` is empty;
 *   3. classify sentiment if `sentiment` is null (rationale is sanitised
 *      inside AiService);
 *   4. emit `news.classified` so SentimentService recomputes the pillar.
 *
 * Retries are governed by BullMQ queue opts (exponential backoff). On
 * the final attempt the doc is marked `failed` so the queue is not
 * blocked and the article is excluded from the aggregator.
 */
@Processor(NEWS_EMBED_CLASSIFY_QUEUE_NAME, {
  concurrency: 4,
  limiter: { max: 60, duration: 60_000 },
})
export class EmbedClassifyProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbedClassifyProcessor.name);

  constructor(
    private readonly ai: AiService,
    private readonly news: NewsService,
    private readonly repo: NewsRepository,
    private readonly events: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<EmbedClassifyJobData>): Promise<unknown> {
    const { newsId } = job.data;
    const doc = await this.repo.findById(newsId);
    if (!doc) {
      this.logger.warn({ newsId }, "embed_classify_doc_missing");
      return { skipped: "missing" };
    }

    const text = `${doc.title}. ${doc.description ?? ""}`.trim();
    try {
      if (!doc.embedding || doc.embedding.length === 0) {
        const vec = await this.ai.embedForStorage(text);
        await this.news.markEmbedded(newsId, vec, EMBEDDING_MODEL, EMBEDDING_VERSION);
      }

      if (!doc.sentiment) {
        const result = await this.ai.classifySentiment(text);
        await this.news.markClassified(newsId, {
          sentiment: result.sentiment,
          sentimentConfidence: result.confidence,
          sentimentRationale: result.rationaleOneLine,
          classifierModel: CLASSIFIER_MODEL,
          classifierVersion: GEMINI_CLASSIFIER_VERSION,
        });
      }

      this.events.emit(NEWS_CLASSIFIED_EVENT, {
        newsId,
        instrumentMentions: doc.instrumentMentions ?? [],
      } satisfies NewsClassifiedEvent);
      return { classified: true };
    } catch (err) {
      const attempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= attempts;
      this.logger.error(
        {
          newsId,
          attempt: job.attemptsMade + 1,
          isFinalAttempt,
          message: err instanceof Error ? err.message : "unknown",
        },
        "embed_classify_failed",
      );
      if (isFinalAttempt) {
        await this.repo.markFailed(newsId);
        return { failed: true };
      }
      throw err; // let BullMQ retry with backoff
    }
  }
}
