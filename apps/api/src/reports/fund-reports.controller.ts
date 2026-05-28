import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from "@nestjs/common";
import type { FundReportDoc } from "@finsight/shared";
import { AccessTokenGuard } from "../modules/auth/access-token.guard";
import { FundReportsService } from "./fund-reports.service";

const SCHEME_CODE_RE = /^\d{1,7}$/;

@Controller("reports/fund")
@UseGuards(AccessTokenGuard)
export class FundReportsController {
  constructor(private readonly funds: FundReportsService) {}

  @Get(":schemeCode")
  async getFund(@Param("schemeCode") schemeCode: string): Promise<FundReportDoc> {
    if (!SCHEME_CODE_RE.test(schemeCode)) {
      throw new BadRequestException("Invalid scheme code");
    }
    const doc = await this.funds.getFund(schemeCode);
    if (!doc) throw new NotFoundException(`No fund report for ${schemeCode}`);
    return doc;
  }
}
