import { createHash } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AnalysisReportService,
  type AnalysisReport,
} from "../analysis/analysis-report.service";
import type { CreateReportDto } from "./dto/create-report.dto";
import type { ListReportsDto } from "./dto/list-reports.dto";
import { ReportsRepository } from "./reports.repository";
import type { SavedReport } from "./schemas/report.schema";

export interface SavedReportListResult {
  readonly items: readonly SavedReport[];
  readonly nextCursor: string | null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly analysis: AnalysisReportService,
    private readonly repository: ReportsRepository,
  ) {}

  async createForOwner(
    ownerUserId: string,
    dto: CreateReportDto,
  ): Promise<SavedReport> {
    const requestedAt = new Date();
    const report = await this.analysis.createStockReport({
      assetName: dto.assetName,
      assetType: dto.assetType,
      symbol: dto.symbol,
      valuation: dto.valuation,
      growth: dto.growth,
      profitability: dto.profitability,
      balanceSheet: dto.balanceSheet,
      momentum: dto.momentum,
      risk: dto.risk,
    });

    return this.repository.create({
      ownerUserId,
      status: "completed",
      asset: report.asset,
      quote: report.quote,
      score: report.score,
      citations: report.citations,
      narrative: report.narrative,
      generation: {
        requestHash: this.hashRequest(ownerUserId, dto, report),
        requestedAt,
        completedAt: new Date(),
      },
    });
  }

  async listForOwner(
    ownerUserId: string,
    query: ListReportsDto,
  ): Promise<SavedReportListResult> {
    return this.repository.listByOwner(ownerUserId, {
      limit: query.limit,
      cursor: query.cursor,
      symbol: query.symbol,
    });
  }

  async getForOwner(ownerUserId: string, id: string): Promise<SavedReport> {
    const report = await this.repository.findByOwnerAndId(ownerUserId, id);
    if (!report) {
      throw new NotFoundException("Report not found");
    }
    return report;
  }

  private hashRequest(
    ownerUserId: string,
    dto: CreateReportDto,
    report: AnalysisReport,
  ): string {
    return createHash("sha256")
      .update(ownerUserId)
      .update("\n")
      .update(report.asset.symbol)
      .update("\n")
      .update(dto.assetName)
      .update("\n")
      .update(
        [
          dto.valuation,
          dto.growth,
          dto.profitability,
          dto.balanceSheet,
          dto.momentum,
          dto.risk,
        ].join(":"),
      )
      .digest("hex");
  }
}
