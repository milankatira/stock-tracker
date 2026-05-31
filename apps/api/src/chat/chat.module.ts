import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../modules/auth/auth.module";
import { PrecomputedReportsModule } from "../reports/reports.module";
import { NewsModule } from "../news/news.module";
import { SearchModule } from "../search/search.module";
import { RefusalDetector } from "../ai/refusal/refusal-detector";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { ChatSession, ChatSessionSchema } from "./chat-session.schema";
import { ChatSessionRepo } from "./chat-session.repo";
import { ChatOwnershipGuard } from "./chat-ownership.guard";

/**
 * Ask FinSight chat module (CHAT-01/03/04/05). Composes:
 *   AiModule                 → AiService.chatStream + TOOL_REGISTRY
 *   PrecomputedReportsModule → ReportsService + FundReportsService (read path)
 *   NewsModule / SearchModule → news + autocomplete read path
 *   AuthModule               → AccessTokenGuard
 *   MongooseModule           → ChatSession persistence (history + idempotency)
 * ThrottlerModule is global (app.module) so ThrottlerGuard resolves here.
 */
@Module({
  imports: [
    AiModule,
    AuthModule,
    PrecomputedReportsModule,
    NewsModule,
    SearchModule,
    MongooseModule.forFeature([{ name: ChatSession.name, schema: ChatSessionSchema }]),
  ],
  controllers: [ChatController],
  providers: [ChatService, RefusalDetector, ChatSessionRepo, ChatOwnershipGuard],
  exports: [ChatService, ChatSessionRepo],
})
export class ChatModule {}
