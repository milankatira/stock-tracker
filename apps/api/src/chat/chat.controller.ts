import {
  BadRequestException,
  Controller,
  type MessageEvent,
  Param,
  Query,
  Sse,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Observable } from "rxjs";
import { AccessTokenGuard } from "../modules/auth/access-token.guard";
import { AuthenticatedUser } from "../modules/auth/authenticated-user.decorator";
import type { AuthenticatedUser as AuthUser } from "../modules/auth/auth.service";
import { ChatService } from "./chat.service";

const MAX_CONTENT_LEN = 2000;
const MESSAGE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Ask FinSight SSE endpoint (CHAT-01). Cookie-JWT authenticated and
 * throttled to 30 messages/min per user. The browser client connects via
 * `@microsoft/fetch-event-source`, sending `content` + `messageId` as
 * query params (Plan 03 may switch to a POST body once it owns the REST
 * surface). This controller owns ONLY the `@Sse` route; Plan 03 adds the
 * REST history endpoints, Plan 04 owns a separate compare controller.
 */
@Controller("chats")
@UseGuards(AccessTokenGuard, ThrottlerGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Sse(":id/messages")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  stream(
    @Param("id") sessionId: string,
    @Query("content") content: string,
    @Query("messageId") messageId: string,
    @AuthenticatedUser() user: AuthUser,
  ): Observable<MessageEvent> {
    // Validate before the Observable starts — a throw here is handled by
    // Nest as a normal 400 (RESEARCH §Pitfall 9); throwing inside the
    // Observable would not be.
    if (
      typeof content !== "string" ||
      content.length === 0 ||
      content.length > MAX_CONTENT_LEN ||
      !MESSAGE_ID_RE.test(messageId ?? "")
    ) {
      throw new BadRequestException("invalid content or messageId");
    }

    // Plan 02 stub: scope is hardcoded; Plan 03 looks it up from the session.
    return this.chatService.streamReply({
      sessionId,
      userId: user.id,
      content,
      messageId,
      scope: { type: "stock", symbols: [] },
    });
  }
}
