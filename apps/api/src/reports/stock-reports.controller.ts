import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from "@nestjs/common";
import type { StockReportDoc } from "@finsight/shared";
import { AccessTokenGuard } from "../modules/auth/access-token.guard";
import { ReportsService } from "./reports.service";

const TICKER_RE = /^[A-Z0-9.&-]+$/;

@Controller("reports/stock")
@UseGuards(AccessTokenGuard)
export class StockReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(":ticker")
  async getStock(@Param("ticker") ticker: string): Promise<StockReportDoc> {
    if (!TICKER_RE.test(ticker)) {
      throw new BadRequestException("Invalid ticker format");
    }
    const doc = await this.reports.getStock(ticker);
    if (!doc) {
      throw new NotFoundException(`No report for ${ticker}`);
    }
    return doc;
  }
}
