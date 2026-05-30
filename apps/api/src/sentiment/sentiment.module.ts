import { Module } from "@nestjs/common";
import { CacheModule } from "../modules/cache/cache.module";
import { NewsModule } from "../news/news.module";
import { EodRecomputeModule } from "../jobs/eod-recompute/eod-recompute.module";
import { SentimentService } from "./sentiment.service";

/**
 * Wires the sentiment-pillar feedback loop (NEWS-04):
 *   NewsModule       → classified-news read access (NewsRepository)
 *   CacheModule      → last-published pillar value (selective-recompute gate)
 *   EodRecomputeModule → selective `eod-recompute` enqueue on material shift
 *
 * The `news.classified` event is delivered via the global EventEmitter,
 * so there is no module dependency from NewsModule back to SentimentModule
 * (no cycle).
 */
@Module({
  imports: [NewsModule, CacheModule, EodRecomputeModule],
  providers: [SentimentService],
  exports: [SentimentService],
})
export class SentimentModule {}
