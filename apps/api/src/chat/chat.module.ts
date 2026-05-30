import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../modules/auth/auth.module";
import { PrecomputedReportsModule } from "../reports/reports.module";
import { NewsModule } from "../news/news.module";
import { SearchModule } from "../search/search.module";
import { RefusalDetector } from "../ai/refusal/refusal-detector";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

/**
 * Ask FinSight chat module (CHAT-01/03/04). Composes:
 *   AiModule                 → AiService.chatStream + TOOL_REGISTRY
 *   PrecomputedReportsModule → ReportsService + FundReportsService (read path)
 *   NewsModule / SearchModule → news + autocomplete read path
 *   AuthModule               → AccessTokenGuard
 * ThrottlerModule is global (app.module) so ThrottlerGuard resolves here.
 *
 * Plan 02 ships only the `@Sse` route; Plan 03 adds REST history endpoints
 * + ChatSession persistence and swaps the hardcoded scope for a session lookup.
 */
@Module({
  imports: [
    AiModule,
    AuthModule,
    PrecomputedReportsModule,
    NewsModule,
    SearchModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, RefusalDetector],
  exports: [ChatService],
})
export class ChatModule {}
