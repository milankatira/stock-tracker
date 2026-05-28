import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AiModule } from "../../ai/ai.module";
import { PrecomputedReportsModule } from "../../reports/reports.module";
import { EodRecomputedListener } from "./eod-recomputed.listener";
import { NarrativeBatchProcessor } from "./narrative-batch.processor";
import { NarrativeBatchQueue } from "./narrative-batch.queue";
import { NarrativeContextProvider } from "./narrative-context.provider";
import { NARRATIVE_BATCH_QUEUE_NAME } from "./narrative-batch.types";

@Module({
  imports: [
    AiModule,
    PrecomputedReportsModule,
    BullModule.registerQueue({ name: NARRATIVE_BATCH_QUEUE_NAME }),
  ],
  providers: [
    NarrativeBatchProcessor,
    NarrativeBatchQueue,
    NarrativeContextProvider,
    EodRecomputedListener,
  ],
  exports: [NarrativeBatchQueue, NarrativeContextProvider],
})
export class NarrativeBatchModule {}
