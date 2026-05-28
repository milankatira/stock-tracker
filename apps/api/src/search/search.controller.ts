import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { InstrumentMatch } from "@finsight/shared";
import { AccessTokenGuard } from "../modules/auth/access-token.guard";
import { SearchQueryDto } from "./dto/search-query.dto";
import { SearchService } from "./search.service";

@Controller("search")
@UseGuards(AccessTokenGuard)
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get("instruments")
  async search(
    @Query() dto: SearchQueryDto,
  ): Promise<readonly InstrumentMatch[]> {
    return this.service.searchInstruments(dto.q, {
      type: dto.type,
      limit: dto.limit,
    });
  }
}
