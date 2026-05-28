import { Module } from "@nestjs/common";
import { MarketDataModule } from "../market-data/market-data.module";
import { NarrativeModule } from "../narrative/narrative.module";
import { AnalysisReportService } from "./analysis-report.service";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";

@Module({
  imports: [MarketDataModule, NarrativeModule],
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisReportService],
  exports: [AnalysisReportService],
})
export class AnalysisModule {}
