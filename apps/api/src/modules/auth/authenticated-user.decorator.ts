import {
  ExecutionContext,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser as AuthenticatedUserShape } from "./auth.service";

/**
 * Extracts the authenticated user attached by `AccessTokenGuard`. Exported
 * separately so unit tests can exercise the resolution logic without
 * synthesising NestJS metadata for the param decorator.
 */
export function resolveAuthenticatedUser(
  context: ExecutionContext,
): AuthenticatedUserShape {
  const request = context
    .switchToHttp()
    .getRequest<Request & { user?: AuthenticatedUserShape }>();
  const user = request.user;
  if (!user || typeof user.id !== "string" || user.id.length === 0) {
    throw new UnauthorizedException("Authenticated user not present on request");
  }
  return user;
}

/**
 * Reads the authenticated user attached by `AccessTokenGuard`. Throws
 * `UnauthorizedException` when the guard did not run or did not attach
 * a user — never returns `undefined` so controller methods can trust the
 * shape.
 */
export const AuthenticatedUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUserShape =>
    resolveAuthenticatedUser(context),
);
