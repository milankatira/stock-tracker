import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { UserProvider } from "../users/schemas/user.schema";

type TokenType = "access" | "refresh";

export interface IssueTokensInput {
  readonly userId: string;
  readonly email: string;
  readonly provider: UserProvider;
}

export interface JwtClaims {
  readonly sub: string;
  readonly email: string;
  readonly provider: UserProvider;
  readonly type: TokenType;
  readonly iat: number;
  readonly exp: number;
}

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly provider: UserProvider;
}

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  issueTokens(input: IssueTokensInput): AuthTokens {
    return {
      accessToken: this.signToken(input, "access"),
      refreshToken: this.signToken(input, "refresh"),
    };
  }

  verifyAccessToken(token: string): JwtClaims {
    return this.verifyToken(token, "access");
  }

  verifyRefreshToken(token: string): JwtClaims {
    return this.verifyToken(token, "refresh");
  }

  refreshTokens(refreshToken: string): AuthTokens {
    const claims = this.verifyRefreshToken(refreshToken);
    return this.issueTokens({
      userId: claims.sub,
      email: claims.email,
      provider: claims.provider,
    });
  }

  getAuthenticatedUser(accessToken: string): AuthenticatedUser {
    const claims = this.verifyAccessToken(accessToken);
    return {
      id: claims.sub,
      email: claims.email,
      provider: claims.provider,
    };
  }

  private signToken(input: IssueTokensInput, type: TokenType): string {
    const now = Math.floor(Date.now() / 1000);
    const claims: JwtClaims = {
      sub: input.userId,
      email: input.email.trim().toLowerCase(),
      provider: input.provider,
      type,
      iat: now,
      exp: now + this.ttlSeconds(type),
    };
    const header = this.encodeJson({ alg: "HS256", typ: "JWT" });
    const payload = this.encodeJson(claims);
    const signature = this.sign(`${header}.${payload}`, this.secret(type));
    return `${header}.${payload}.${signature}`;
  }

  private verifyToken(token: string, expectedType: TokenType): JwtClaims {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("malformed token");

      const [header, payload, signature] = parts;
      if (!header || !payload || !signature) throw new Error("malformed token");
      const expectedSignature = this.sign(
        `${header}.${payload}`,
        this.secret(expectedType),
      );
      if (!this.safeEqual(signature, expectedSignature)) {
        throw new Error("signature mismatch");
      }

      const claims = this.parseClaims(payload);
      if (claims.type !== expectedType) throw new Error("token type mismatch");
      if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("token expired");
      return claims;
    } catch (cause) {
      throw new Error(`Invalid ${expectedType} token`, { cause });
    }
  }

  private parseClaims(payload: string): JwtClaims {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (!this.isClaims(parsed)) throw new Error("invalid claims");
    return parsed;
  }

  private isClaims(value: unknown): value is JwtClaims {
    if (typeof value !== "object" || value === null) return false;
    const claims = value as Partial<JwtClaims>;
    return (
      typeof claims.sub === "string" &&
      typeof claims.email === "string" &&
      (claims.provider === "local" || claims.provider === "google") &&
      (claims.type === "access" || claims.type === "refresh") &&
      typeof claims.iat === "number" &&
      typeof claims.exp === "number"
    );
  }

  private encodeJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  }

  private sign(data: string, secret: string): string {
    return createHmac("sha256", secret).update(data).digest("base64url");
  }

  private safeEqual(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private secret(type: TokenType): string {
    return this.config.getOrThrow<string>(
      type === "access" ? "JWT_ACCESS_SECRET" : "JWT_REFRESH_SECRET",
    );
  }

  private ttlSeconds(type: TokenType): number {
    return this.config.getOrThrow<number>(
      type === "access" ? "JWT_ACCESS_TTL_SECONDS" : "JWT_REFRESH_TTL_SECONDS",
    );
  }
}
