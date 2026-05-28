import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService, type AuthenticatedUser } from "./auth.service";

/**
 * Verifies an access token from the `Authorization: Bearer …` header or the
 * `access_token` cookie (signed preferred, unsigned fallback) and attaches
 * the resolved user to `request.user`.
 *
 * Owner identity for protected routes MUST come from this guard — never from
 * a client-supplied body, query, or param field.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.readAccessToken(request);
    let user: AuthenticatedUser;
    try {
      user = this.auth.getAuthenticatedUser(token);
    } catch {
      throw new UnauthorizedException("Invalid auth token");
    }
    (request as Request & { user?: AuthenticatedUser }).user = user;
    return true;
  }

  private readAccessToken(request: Request): string {
    const authorization = request.headers.authorization;
    if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
      const bearer = authorization.slice("Bearer ".length).trim();
      if (bearer.length > 0) return bearer;
    }

    const signed = this.readCookieBag(request.signedCookies, "access_token");
    if (signed) return signed;

    const unsigned = this.readCookieBag(request.cookies, "access_token");
    if (unsigned) return unsigned;

    throw new UnauthorizedException("Missing auth token");
  }

  private readCookieBag(cookies: unknown, name: string): string | undefined {
    if (typeof cookies !== "object" || cookies === null) return undefined;
    const value = (cookies as Record<string, unknown>)[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }
}
