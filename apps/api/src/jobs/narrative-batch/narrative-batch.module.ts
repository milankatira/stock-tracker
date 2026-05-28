import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AiModule } from "../../ai/ai.module";
import { PrecomputedReportsModule } from "../../reports/reports.module";
import { EodRecomputedListener } from "./eod-recomputed.listener";
import { FundEodRecomputedListener } from "./fund-eod-recomputed.listener";
import { FundNarrativeBatchProcessor } from "./fund-narrative-batch.processor";
import { FundNarrativeBatchQueue } from "./fund-narrative-batch.queue";
import { FundNarrativeContextProvider } from "./fund-narrative-context.provider";
import { FUND_NARRATIVE_BATCH_QUEUE_NAME } from "./fund-narrative-batch.types";
import { NarrativeBatchProcessor } from "./narrative-batch.processor";
import { NarrativeBatchQueue } from "./narrative-batch.queue";
import { NarrativeContextProvider } from "./narrative-context.provider";
import { NARRATIVE_BATCH_QUEUE_NAME } from "./narrative-batch.types";

@Module({
  imports: [
    AiModule,
    PrecomputedReportsModule,
    BullModule.registerQueue(
      { name: NARRATIVE_BATCH_QUEUE_NAME },
      { name: FUND_NARRATIVE_BATCH_QUEUE_NAME },
    ),
  ],
  providers: [
    NarrativeBatchProcessor,
    NarrativeBatchQueue,
    NarrativeContextProvider,
    EodRecomputedListener,
    FundNarrativeBatchProcessor,
    FundNarrativeBatchQueue,
    FundNarrativeContextProvider,
    FundEodRecomputedListener,
  ],
  exports: [
    NarrativeBatchQueue,
    NarrativeContextProvider,
    FundNarrativeBatchQueue,
    FundNarrativeContextProvider,
  ],
})
export class NarrativeBatchModule {}
