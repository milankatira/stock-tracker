import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard } from "../modules/auth/access-token.guard";
import { NewsService, type NewsListItem } from "./news.service";

const TICKER_RE = /^[A-Z0-9.&-]+$/;
const MAX_LIMIT = 50;

@Controller("stocks/:ticker/news")
@UseGuards(AccessTokenGuard)
export class NewsController {
  constructor(private readonly service: NewsService) {}

  @Get()
  @Header("Cache-Control", "public, max-age=60")
  async list(
    @Param("ticker") ticker: string,
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<readonly NewsListItem[]> {
    if (!TICKER_RE.test(ticker)) {
      throw new BadRequestException("Invalid ticker");
    }
    const safeLimit = Math.max(1, Math.min(MAX_LIMIT, limit));
    return this.service.getRecentForTicker(ticker, safeLimit);
  }
}
