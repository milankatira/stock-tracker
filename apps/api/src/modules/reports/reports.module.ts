import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AnalysisModule } from "../analysis/analysis.module";
import { AuthModule } from "../auth/auth.module";
import { ReportsController } from "./reports.controller";
import { ReportsRepository } from "./reports.repository";
import { ReportsService } from "./reports.service";
import { Report, ReportSchema } from "./schemas/report.schema";

@Module({
  imports: [
    AnalysisModule,
    AuthModule,
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
  ],
  controllers: [ReportsController],
  providers: [ReportsRepository, ReportsService],
  exports: [ReportsRepository, ReportsService],
})
export class ReportsModule {}
