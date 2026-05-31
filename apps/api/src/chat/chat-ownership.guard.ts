import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "../modules/auth/auth.service";
import { ChatSessionRepo } from "./chat-session.repo";

/**
 * Tenant-isolation guard for every `/chats/:id*` route (T-07-15 IDOR).
 * A session `_id` is guessable, so ownership is enforced server-side on
 * every request: the session must exist, belong to `req.user.id`, and not
 * be soft-deleted — otherwise `ForbiddenException`. Runs AFTER
 * `AccessTokenGuard` (which populates `req.user`).
 */
@Injectable()
export class ChatOwnershipGuard implements CanActivate {
  constructor(private readonly sessions: ChatSessionRepo) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser; params: { id?: string } }>();
    const userId = req.user?.id;
    const sessionId = req.params?.id;
    if (!userId || !sessionId) {
      throw new ForbiddenException("chat session not accessible");
    }
    const owned = await this.sessions.exists(sessionId, userId);
    if (!owned) {
      throw new ForbiddenException("chat session not accessible");
    }
    return true;
  }
}
