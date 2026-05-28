import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { AllExceptionsFilter } from "./all-exceptions.filter";
import { isApiError } from "@finsight/shared";

/**
 * Threat T-01-02-01 / T-01-02-07: stack traces and env values must NEVER leak
 * via HTTP response bodies. AllExceptionsFilter is the last line of defense
 * before bytes go on the wire — these specs lock the sanitization contract.
 */

interface CapturedResponse {
  status: number;
  body: unknown;
}

function makeHost(): { host: ArgumentsHost; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, body: undefined };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe("AllExceptionsFilter", () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it("maps BadRequestException → 400 / kind: 'validation'", () => {
    const { host, captured } = makeHost();
    filter.catch(new BadRequestException("bad body"), host);
    expect(captured.status).toBe(400);
    const body = captured.body as { error: unknown };
    expect(isApiError(body.error)).toBe(true);
    expect((body.error as { kind: string }).kind).toBe("validation");
  });

  it("preserves ValidationPipe details on BadRequestException", () => {
    const { host, captured } = makeHost();
    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ["email must be an email"],
        error: "Bad Request",
      }),
      host,
    );
    expect(captured.status).toBe(400);
    const body = captured.body as { error: { kind: string; details?: unknown } };
    expect(body.error.kind).toBe("validation");
    expect(body.error.details).toBeDefined();
  });

  it("maps UnauthorizedException → 401 / kind: 'unauthorized'", () => {
    const { host, captured } = makeHost();
    filter.catch(new UnauthorizedException("nope"), host);
    expect(captured.status).toBe(401);
    expect((captured.body as { error: { kind: string } }).error.kind).toBe(
      "unauthorized",
    );
  });

  it("maps ForbiddenException → 403 / kind: 'forbidden'", () => {
    const { host, captured } = makeHost();
    filter.catch(new ForbiddenException("denied"), host);
    expect(captured.status).toBe(403);
    expect((captured.body as { error: { kind: string } }).error.kind).toBe(
      "forbidden",
    );
  });

  it("maps NotFoundException → 404 / kind: 'not_found'", () => {
    const { host, captured } = makeHost();
    filter.catch(new NotFoundException("missing"), host);
    expect(captured.status).toBe(404);
    expect((captured.body as { error: { kind: string } }).error.kind).toBe(
      "not_found",
    );
  });

  it("maps ConflictException → 409 / kind: 'conflict'", () => {
    const { host, captured } = makeHost();
    filter.catch(new ConflictException("dup"), host);
    expect(captured.status).toBe(409);
    expect((captured.body as { error: { kind: string } }).error.kind).toBe(
      "conflict",
    );
  });

  it("maps HttpException(429) → kind: 'rate_limited'", () => {
    const { host, captured } = makeHost();
    filter.catch(
      new HttpException("slow down", HttpStatus.TOO_MANY_REQUESTS),
      host,
    );
    expect(captured.status).toBe(429);
    expect((captured.body as { error: { kind: string } }).error.kind).toBe(
      "rate_limited",
    );
  });

  it("maps unknown HttpException status → kind: 'server_error'", () => {
    const { host, captured } = makeHost();
    filter.catch(
      new HttpException("teapot", HttpStatus.I_AM_A_TEAPOT),
      host,
    );
    expect(captured.status).toBe(HttpStatus.I_AM_A_TEAPOT);
    expect((captured.body as { error: { kind: string } }).error.kind).toBe(
      "server_error",
    );
  });

  it("maps unknown thrown value (not an Error) → 500 / kind: 'server_error' with generic message", () => {
    const { host, captured } = makeHost();
    // Silence the expected error log so test output stays clean.
    vi.spyOn(filter["logger"], "error").mockImplementation(() => undefined);
    filter.catch("raw string boom", host);
    expect(captured.status).toBe(500);
    const body = captured.body as { error: { kind: string; message: string } };
    expect(body.error.kind).toBe("server_error");
    expect(body.error.message).toBe("Internal server error");
  });

  it("never leaks a stack trace in the response body for unknown errors", () => {
    const { host, captured } = makeHost();
    vi.spyOn(filter["logger"], "error").mockImplementation(() => undefined);
    const boom = new Error("inner failure with secret /etc/passwd");
    filter.catch(boom, host);
    const body = captured.body as { error: { message: string } };
    expect(body.error.message).toBe("Internal server error");
    // Stack must NOT appear in any string on the wire.
    expect(JSON.stringify(body)).not.toMatch(/at\s+Object\.|secret|\/etc/);
  });

  it("response body always has shape { error: ApiError }", () => {
    const { host, captured } = makeHost();
    filter.catch(new BadRequestException("x"), host);
    expect(captured.body).toHaveProperty("error");
    expect(isApiError((captured.body as { error: unknown }).error)).toBe(true);
  });

  it("preserves Terminus health-check 503 bodies so readiness failures surface indicators", () => {
    const { host, captured } = makeHost();
    const healthBody = {
      status: "error",
      info: { mongo: { status: "up" } },
      error: { redis: { status: "down", message: "Redis ping failed" } },
      details: {
        mongo: { status: "up" },
        redis: { status: "down", message: "Redis ping failed" },
      },
    };

    filter.catch(new ServiceUnavailableException(healthBody), host);

    expect(captured.status).toBe(503);
    expect(captured.body).toEqual(healthBody);
  });
});
