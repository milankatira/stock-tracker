import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import type { WatchlistResponse } from "@finsight/shared";
import { AccessTokenGuard } from "../modules/auth/access-token.guard";
import type { AuthenticatedUser } from "../modules/auth/auth.service";
import { AddItemDto } from "./dto/add-item.dto";
import { WatchlistService } from "./watchlist.service";

const MONGO_ID_RE = /^[a-fA-F0-9]{24}$/;

interface AuthedRequest extends Request {
  readonly user?: AuthenticatedUser;
}

@Controller("watchlist")
@UseGuards(AccessTokenGuard)
export class WatchlistController {
  constructor(private readonly service: WatchlistService) {}

  @Get()
  async list(@Req() req: AuthedRequest): Promise<WatchlistResponse> {
    return this.service.getWithScores(this.userId(req));
  }

  @Post("items")
  @HttpCode(204)
  async add(
    @Req() req: AuthedRequest,
    @Body() dto: AddItemDto,
  ): Promise<void> {
    await this.service.addItem(this.userId(req), dto);
  }

  @Delete("items/:instrumentId")
  @HttpCode(204)
  async remove(
    @Req() req: AuthedRequest,
    @Param("instrumentId") instrumentId: string,
  ): Promise<void> {
    if (!MONGO_ID_RE.test(instrumentId)) {
      // Surface as 404 to avoid leaking validation details.
      await this.service.removeItem(this.userId(req), instrumentId);
      return;
    }
    await this.service.removeItem(this.userId(req), instrumentId);
  }

  private userId(req: AuthedRequest): string {
    const user = req.user;
    if (!user) {
      throw new Error("AccessTokenGuard must populate request.user");
    }
    return user.id;
  }
}
