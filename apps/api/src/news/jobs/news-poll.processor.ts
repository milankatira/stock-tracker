import { Processor, WorkerHost, InjectQueue } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import {
  IngestSourceJobData,
  NEWS_INGEST_SOURCE_JOB,
  NEWS_POLL_QUEUE_NAME,
  NEWS_POLL_TICK_JOB,
  NEWS_PROCESS_ARTICLE_JOB,
  type ProcessArticleJobData,
} from "./news-poll.queue";
import { FEED_REGISTRY } from "../ingest/feed-registry";
import { canonicalize, hashContent } from "../ingest/dedup";
import { tagMentions, type InstrumentEntry } from "../ingest/ticker-tagger";
import { NewsService } from "../news.service";
import { RssNewsAdapter } from "../../modules/market-data/rss-news.adapter";
import { InstrumentsRepository } from "../../modules/market-data/instruments/instruments.repository";

/**
 * BullMQ processor for the three-tier news-poll fan-out. Persists
 * `classificationStatus: 'pending'` docs only — Plan 06-02 wires the
 * embed + classify steps.
 *
 * Tier 1 (`news-poll:tick`): the repeatable parent. Enqueues one
 *   `ingest-source` per `FEED_REGISTRY` entry.
 * Tier 2 (`ingest-source`): pulls a single feed via the existing
 *   Phase 2 RSS adapter, then enqueues one `process-article` per
 *   parsed item.
 * Tier 3 (`process-article`): canonicalises the URL, hashes the title,
 *   runs the group-aware ticker-tagger, drops the article when no
 *   instrument is mentioned, otherwise upserts the pending doc.
 */
@Processor(NEWS_POLL_QUEUE_NAME, { concurrency: 4 })
export class NewsPollProcessor extends WorkerHost {
  private readonly logger = new Logger(NewsPollProcessor.name);

  constructor(
    @InjectQueue(NEWS_POLL_QUEUE_NAME) private readonly queue: Queue,
    private readonly rss: RssNewsAdapter,
    private readonly news: NewsService,
    private readonly instruments: InstrumentsRepository,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case NEWS_POLL_TICK_JOB:
        return this.tick();
      case NEWS_INGEST_SOURCE_JOB:
        return this.ingestSource(job.data as IngestSourceJobData);
      case NEWS_PROCESS_ARTICLE_JOB:
        return this.processArticle(job.data as ProcessArticleJobData);
      default:
        return { ignored: true, name: job.name };
    }
  }

  private async tick(): Promise<{ enqueued: number }> {
    let enqueued = 0;
    for (const entry of FEED_REGISTRY) {
      await this.queue.add(
        NEWS_INGEST_SOURCE_JOB,
        { source: entry.source, url: entry.url } satisfies IngestSourceJobData,
        {
          jobId: `news-source:${entry.source}:${this.bucketWindow()}`,
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 1000 },
        },
      );
      enqueued += 1;
    }
    return { enqueued };
  }

  private async ingestSource(data: IngestSourceJobData): Promise<{ scheduled: number }> {
    const since = new Date(Date.now() - 30 * 60 * 1000);
    const result = await this.rss.getRecent(since);
    if (result.status !== "ok") {
      this.logger.warn(
        { source: data.source, status: result.status },
        "news_ingest_source_skipped",
      );
      return { scheduled: 0 };
    }
    const items = result.data.filter((i) => i.source === data.source);
    let scheduled = 0;
    for (const item of items) {
      await this.queue.add(
        NEWS_PROCESS_ARTICLE_JOB,
        {
          source: item.source,
          externalId: item.guid,
          url: item.url,
          title: item.title,
          description: item.body,
          publishedAt: item.publishedAt.toISOString(),
        } satisfies ProcessArticleJobData,
        {
          jobId: `news-article:${item.source}:${item.guid}`,
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      );
      scheduled += 1;
    }
    return { scheduled };
  }

  private async processArticle(
    data: ProcessArticleJobData,
  ): Promise<{ persisted: boolean; deduped?: boolean; dropped?: "no-mention" }> {
    const canonicalUrl = canonicalize(data.url);
    const contentHash = hashContent(data.title, data.source);

    const instruments = await this.loadInstruments();
    const taggerInput = `${data.title} ${data.description ?? ""}`;
    const tagged = tagMentions(taggerInput, instruments);

    if (tagged.instrumentMentions.length === 0 && !tagged.groupLevel) {
      this.logger.debug(
        { source: data.source, externalId: data.externalId },
        "news_article_no_instrument_mention_dropped",
      );
      return { persisted: false, dropped: "no-mention" };
    }

    const persisted = await this.news.upsertPending({
      source: data.source,
      externalId: data.externalId,
      url: data.url,
      canonicalUrl,
      contentHash,
      title: data.title,
      description: data.description,
      publishedAt: new Date(data.publishedAt),
      instrumentMentions: [...tagged.instrumentMentions],
      groupLevel: tagged.groupLevel,
    });
    if (!persisted) return { persisted: false, deduped: true };
    return { persisted: true };
  }

  private async loadInstruments(): Promise<readonly InstrumentEntry[]> {
    const records = await this.instruments.listActiveTickers();
    return records.map((r) => ({
      instrumentId: String(r._id),
      symbol: r.nseSymbol,
      name: r.name,
    }));
  }

  /**
   * Bucket the tick into a 30-minute window so retries within the same
   * window collapse to the same BullMQ jobId (versioned idempotency).
   */
  private bucketWindow(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${Math.floor(
      now.getUTCHours() * 2 + now.getUTCMinutes() / 30,
    )}`;
  }
}
