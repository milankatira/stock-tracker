import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { AuthenticatedUser } from "../auth/authenticated-user.decorator";
import type { AuthenticatedUser as AuthenticatedUserShape } from "../auth/auth.service";
import { CreateReportDto } from "./dto/create-report.dto";
import { ListReportsDto } from "./dto/list-reports.dto";
import { ReportsService } from "./reports.service";
import type { SavedReport } from "./schemas/report.schema";

export interface SavedReportListResponse {
  readonly items: readonly SavedReport[];
  readonly nextCursor: string | null;
}

@Controller("reports")
@UseGuards(AccessTokenGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  create(
    @AuthenticatedUser() user: AuthenticatedUserShape,
    @Body() body: CreateReportDto,
  ): Promise<SavedReport> {
    return this.reports.createForOwner(user.id, body);
  }

  @Get()
  list(
    @AuthenticatedUser() user: AuthenticatedUserShape,
    @Query() query: ListReportsDto,
  ): Promise<SavedReportListResponse> {
    return this.reports.listForOwner(user.id, query);
  }

  @Get(":id")
  detail(
    @AuthenticatedUser() user: AuthenticatedUserShape,
    @Param("id") id: string,
  ): Promise<SavedReport> {
    return this.reports.getForOwner(user.id, id);
  }
}
