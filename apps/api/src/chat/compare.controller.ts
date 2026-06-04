import { Body, Controller, Post, Res, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Response } from "express";
import type { ComparisonVerdict, PendingScoreResponse } from "@finsight/shared";
import { AccessTokenGuard } from "../modules/auth/access-token.guard";
import { CompareService } from "./compare.service";
import { CompareDto } from "./dto/compare.dto";

/**
 * 2-3-way comparison endpoint (STOCK-07). Deliberately a SEPARATE
 * controller from `chat.controller.ts` so this plan ships parallel with
 * Plan 03 (chat history) without file conflicts — comparison is a single
 * structured verdict, not a conversation, so it does not share the SSE
 * chat path.
 *
 * Cookie-JWT authenticated (`AccessTokenGuard`); throttled to 10
 * comparisons/min/user (T-07-27 — caps bill-spike via comparison-loop
 * abuse, since each request is exactly one non-streaming Gemini call).
 * When any input lacks a persisted score the service returns a
 * `PendingScoreResponse`, which is surfaced as HTTP 422.
 */
@Controller("compare")
@UseGuards(AccessTokenGuard)
export class CompareController {
  constructor(private readonly compareService: CompareService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async compare(
    @Body() dto: CompareDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ComparisonVerdict | PendingScoreResponse> {
    const result = await this.compareService.compare(dto.symbols);
    if ("error" in result && result.error === "SCORE_PENDING") {
      res.status(422);
    }
    return result;
  }
}
