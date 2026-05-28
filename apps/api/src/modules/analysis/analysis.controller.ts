import { Body, Controller, Post } from "@nestjs/common";
import type { ScoreResult } from "@finsight/shared";
import { AnalysisReportService, type AnalysisReport } from "./analysis-report.service";
import { AnalysisService } from "./analysis.service";
import { ReportRequestDto } from "./dto/report-request.dto";
import { ScoreRequestDto } from "./dto/score-request.dto";

@Controller("analysis")
export class AnalysisController {
  constructor(
    private readonly analysis: AnalysisService,
    private readonly reports: AnalysisReportService,
  ) {}

  @Post("score")
  score(@Body() body: ScoreRequestDto): ScoreResult {
    return this.analysis.score(body);
  }

  @Post("report")
  report(@Body() body: ReportRequestDto): Promise<AnalysisReport> {
    return this.reports.createStockReport(body);
  }
}
