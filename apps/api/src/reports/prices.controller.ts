import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { OhlcCandle } from "@finsight/shared";
import { AccessTokenGuard } from "../modules/auth/access-token.guard";
import { TimeframeQueryDto } from "./dto/timeframe.dto";
import { PricesService } from "./prices.service";

const TICKER_RE = /^[A-Z0-9.&-]+$/;

@Controller("reports/stock")
@UseGuards(AccessTokenGuard)
export class PricesController {
  constructor(private readonly prices: PricesService) {}

  @Get(":ticker/prices")
  async getPrices(
    @Param("ticker") ticker: string,
    @Query() query: TimeframeQueryDto,
  ): Promise<readonly OhlcCandle[]> {
    if (!TICKER_RE.test(ticker)) {
      throw new BadRequestException("Invalid ticker format");
    }
    return this.prices.getCandles(ticker, query.tf);
  }
}
