import { randomBytes } from "node:crypto";
import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import {
  AuthService,
  type AuthenticatedUser,
  type AuthTokens,
} from "./auth.service";
import { GoogleAuthService } from "./google-auth.service";

interface AuthenticatedUserResponse {
  readonly user: AuthenticatedUser;
}

interface RefreshResponse {
  readonly authenticated: true;
}

interface LogoutResponse {
  readonly ok: true;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly googleAuth: GoogleAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get("me")
  me(@Req() request: Request): AuthenticatedUserResponse {
    return { user: this.auth.getAuthenticatedUser(this.readAccessToken(request)) };
  }

  @Post("refresh")
  refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): RefreshResponse {
    const refreshToken = this.readCookie(request, "refresh_token");
    const tokens = this.auth.refreshTokens(refreshToken);
    this.writeAuthCookies(response, tokens);
    return { authenticated: true };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) response: Response): LogoutResponse {
    response.clearCookie("access_token", { path: "/" });
    response.clearCookie("refresh_token", { path: "/" });
    return { ok: true };
  }

  @Get("google")
  googleStart(@Res() response: Response): void {
    const state = randomBytes(24).toString("base64url");
    response.cookie("google_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      signed: true,
      path: "/",
      maxAge: 10 * 60 * 1000,
    });
    response.redirect(this.googleAuthorizationUrl(state));
  }

  @Get("google/callback")
  async googleCallback(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    this.assertGoogleState(request);
    const tokens = await this.authenticateGoogle(request);
    this.writeAuthCookies(response, tokens);
    response.clearCookie("google_oauth_state", { path: "/" });
    response.redirect("/");
  }

  private googleAuthorizationUrl(state: string): string {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.config.getOrThrow<string>("GOOGLE_CLIENT_ID"));
    url.searchParams.set(
      "redirect_uri",
      this.config.getOrThrow<string>("GOOGLE_CALLBACK_URL"),
    );
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  private assertGoogleState(request: Request): void {
    const expected = this.readCookie(request, "google_oauth_state");
    const actual = this.readQueryString(request.query.state);
    if (actual !== expected) {
      throw new UnauthorizedException("Invalid Google OAuth state");
    }
  }

  private readQueryString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  private authenticateGoogle(request: Request): Promise<AuthTokens> {
    const strategy = new GoogleStrategy(
      {
        clientID: this.config.getOrThrow<string>("GOOGLE_CLIENT_ID"),
        clientSecret: this.config.getOrThrow<string>("GOOGLE_CLIENT_SECRET"),
        callbackURL: this.config.getOrThrow<string>("GOOGLE_CALLBACK_URL"),
        scope: ["email", "profile"],
      },
      (_accessToken, _refreshToken, profile: Profile, done) => {
        this.googleAuth
          .signIn(profile)
          .then((tokens) => done(null, tokens))
          .catch((error: unknown) => done(error));
      },
    ) as GoogleStrategy & GoogleStrategyActions;

    return new Promise<AuthTokens>((resolve, reject) => {
      strategy.success = (user: unknown) => {
        if (!this.isAuthTokens(user)) {
          reject(new UnauthorizedException("Google OAuth did not return tokens"));
          return;
        }
        resolve(user);
      };
      strategy.error = (error: unknown) => {
        reject(error instanceof Error ? error : new Error("Google OAuth failed"));
      };
      strategy.fail = () => reject(new UnauthorizedException("Google OAuth failed"));
      strategy.redirect = () => {
        reject(new UnauthorizedException("Unexpected Google OAuth redirect"));
      };
      strategy.authenticate(request);
    });
  }

  private readAccessToken(request: Request): string {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      return authorization.slice("Bearer ".length);
    }
    return this.readCookie(request, "access_token");
  }

  private readCookie(request: Request, name: string): string {
    const signed = this.readCookieBag(request.signedCookies, name);
    const unsigned = this.readCookieBag(request.cookies, name);
    const token = signed ?? unsigned;
    if (!token) throw new UnauthorizedException("Missing auth token");
    return token;
  }

  private readCookieBag(cookies: unknown, name: string): string | undefined {
    if (typeof cookies !== "object" || cookies === null) return undefined;
    const value = (cookies as Record<string, unknown>)[name];
    return typeof value === "string" ? value : undefined;
  }

  private writeAuthCookies(response: Response, tokens: AuthTokens): void {
    response.cookie("access_token", tokens.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      signed: true,
      path: "/",
      maxAge: 15 * 60 * 1000,
    });
    response.cookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      signed: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private isAuthTokens(value: unknown): value is AuthTokens {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<AuthTokens>;
    return (
      typeof candidate.accessToken === "string" &&
      typeof candidate.refreshToken === "string"
    );
  }
}

interface GoogleStrategyActions {
  success(user: unknown): void;
  error(error: unknown): void;
  fail(): void;
  redirect(): void;
  authenticate(request: Request): void;
}
