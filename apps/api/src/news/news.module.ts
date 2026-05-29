import { Module, type OnApplicationBootstrap } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { MongooseModule, getConnectionToken } from "@nestjs/mongoose";
import { Inject } from "@nestjs/common";
import type { Connection } from "mongoose";
import { AuthModule } from "../modules/auth/auth.module";
import { MarketDataModule } from "../modules/market-data/market-data.module";
import { News, NewsSchema } from "./news.schema";
import { NewsController } from "./news.controller";
import { NewsRepository } from "./news.repository";
import { NewsService } from "./news.service";
import { NewsPollProcessor } from "./jobs/news-poll.processor";
import { NEWS_POLL_QUEUE_NAME } from "./jobs/news-poll.queue";
import { assertNewsVectorIndex } from "./vector/vector-index.assert";
import { probeFeeds } from "./ingest/feed-probe";
import { FEED_REGISTRY } from "./ingest/feed-registry";

@Module({
  imports: [
    AuthModule,
    MarketDataModule,
    MongooseModule.forFeature([{ name: News.name, schema: NewsSchema }]),
    BullModule.registerQueue({ name: NEWS_POLL_QUEUE_NAME }),
  ],
  controllers: [NewsController],
  providers: [NewsRepository, NewsService, NewsPollProcessor],
  exports: [NewsService, NewsRepository],
})
export class NewsModule implements OnApplicationBootstrap {
  constructor(
    @Inject(getConnectionToken()) private readonly conn: Connection,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Atlas Vector Search index assertion. No-op locally; throws when
    // ATLAS_VECTOR_ASSERT=true and the deployed index is missing or has
    // the wrong numDimensions.
    await assertNewsVectorIndex(this.conn);
    // Boot probe — logs only, never throws.
    if (process.env.NEWS_FEED_PROBE_AT_BOOT === "true") {
      await probeFeeds(FEED_REGISTRY);
    }
  }
}
