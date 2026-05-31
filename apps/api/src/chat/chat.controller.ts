import {
  BadRequestException,
  Body,
  Controller,
  Get,
  type MessageEvent,
  Param,
  Post,
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
import { ChatSessionRepo } from "./chat-session.repo";
import { ChatOwnershipGuard } from "./chat-ownership.guard";
import { CreateChatDto } from "./dto/create-chat.dto";
import { ListChatsDto } from "./dto/list-chats.dto";

const MAX_CONTENT_LEN = 2000;
const MESSAGE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_LIST_LIMIT = 20;

/**
 * Ask FinSight chat endpoints (CHAT-01/05). All routes are cookie-JWT
 * authenticated; every `:id` route additionally passes `ChatOwnershipGuard`
 * (T-07-15 IDOR). The SSE route is throttled to 30 msg/min per user.
 */
@Controller("chats")
@UseGuards(AccessTokenGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly sessions: ChatSessionRepo,
  ) {}

  @Post()
  create(@Body() dto: CreateChatDto, @AuthenticatedUser() user: AuthUser) {
    return this.sessions.create({
      userId: user.id,
      title: dto.title,
      scope: { type: dto.scope.type, symbols: dto.scope.symbols },
    });
  }

  @Get()
  list(@AuthenticatedUser() user: AuthUser, @Query() q: ListChatsDto) {
    return this.sessions.listByUser(user.id, q.cursor, q.limit ?? DEFAULT_LIST_LIMIT);
  }

  @Get(":id")
  @UseGuards(ChatOwnershipGuard)
  get(@Param("id") id: string, @AuthenticatedUser() user: AuthUser) {
    return this.sessions.getById(id, user.id);
  }

  @Sse(":id/messages")
  @UseGuards(ChatOwnershipGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  stream(
    @Param("id") sessionId: string,
    @Query("content") content: string,
    @Query("messageId") messageId: string,
    @AuthenticatedUser() user: AuthUser,
  ): Observable<MessageEvent> {
    if (
      typeof content !== "string" ||
      content.length === 0 ||
      content.length > MAX_CONTENT_LEN ||
      !MESSAGE_ID_RE.test(messageId ?? "")
    ) {
      throw new BadRequestException("invalid content or messageId");
    }
    return this.chatService.streamReply({
      sessionId,
      userId: user.id,
      content,
      messageId,
    });
  }
}
