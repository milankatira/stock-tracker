import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../modules/auth/auth.module";
import { PrecomputedReportsModule } from "../reports/reports.module";
import { CompareController } from "./compare.controller";
import { CompareService } from "./compare.service";

/**
 * Stock comparison module (STOCK-07). Composes:
 *   AiModule                 → AiService.compare (structured-output verdict)
 *   PrecomputedReportsModule → ReportsService (deterministic score read path)
 *   AuthModule               → AccessTokenGuard
 * ThrottlerModule is global (app.module) so ThrottlerGuard resolves here.
 *
 * Intentionally owns its own controller/service (separate from ChatModule)
 * so it can ship parallel with the chat-history plan.
 */
@Module({
  imports: [AiModule, AuthModule, PrecomputedReportsModule],
  controllers: [CompareController],
  providers: [CompareService],
})
export class CompareModule {}
