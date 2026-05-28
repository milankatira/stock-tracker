import { Module } from "@nestjs/common";
import { ReportsService } from "./reports.service";

/**
 * Precomputed-report module — the Plan 04-02 narrative-batch processor
 * persists results via this stub. Plan 04-03 will register the Mongoose
 * schema + Redis bust here.
 *
 * Distinct from `apps/api/src/modules/reports/reports.module.ts`
 * (Phase 2 saved-report-history feature).
 */
@Module({
  providers: [ReportsService],
  exports: [ReportsService],
})
export class PrecomputedReportsModule {}
