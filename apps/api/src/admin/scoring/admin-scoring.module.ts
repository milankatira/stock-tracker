import { Module } from "@nestjs/common";
import { AdminScoringController } from "./admin-scoring.controller";
import { AuthModule } from "../../modules/auth/auth.module";
import { EodRecomputeModule } from "../../jobs/eod-recompute/eod-recompute.module";

@Module({
  imports: [AuthModule, EodRecomputeModule],
  controllers: [AdminScoringController],
})
export class AdminScoringModule {}
