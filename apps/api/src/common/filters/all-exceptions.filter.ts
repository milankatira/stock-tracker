import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import type { ApiError } from "@finsight/shared";

interface HealthProbeBody {
  status: string;
  info?: Record<string, unknown>;
  error?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

type ExceptionResponseBody = ApiError | HealthProbeBody;

/**
 * Global exception filter — sanitizes every error before it leaves the
 * process. Wire via `app.useGlobalFilters(new AllExceptionsFilter())` in
 * `main.ts`.
 *
 * Contract (T-01-02-01 / T-01-02-07):
 *   - Application errors are `{ error: ApiError }` (discriminated union from
 *     `@finsight/shared`) — clients narrow on `kind` for branching UI.
 *   - Terminus readiness failures keep their safe probe body so orchestrators
 *     can see which dependency is down.
 *   - Stack traces NEVER appear in the response body.
 *   - Original error is logged server-side with full stack via the Nest
 *     Logger; the client gets a generic "Internal server error" message.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const { status, body } = this.toApiError(exception);
    if (this.isHealthProbeBody(body)) {
      res.status(status).json(body);
      return;
    }
    res.status(status).json({ error: body });
  }

  /**
   * Pure mapping function — extracted for direct unit testing without an
   * `ArgumentsHost` mock. Returns the status code and sanitized response body.
   */
  toApiError(exception: unknown): { status: number; body: ExceptionResponseBody } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      const healthBody = this.extractHealthProbeBody(resp);
      if (status === HttpStatus.SERVICE_UNAVAILABLE && healthBody) {
        return { status, body: healthBody };
      }

      const message = this.extractMessage(resp, exception.message);
      const details = typeof resp === "object" && resp !== null ? resp : undefined;

      switch (status) {
        case HttpStatus.BAD_REQUEST:
          return { status, body: { kind: "validation", message, details } };
        case HttpStatus.UNAUTHORIZED:
          return { status, body: { kind: "unauthorized", message } };
        case HttpStatus.FORBIDDEN:
          return { status, body: { kind: "forbidden", message } };
        case HttpStatus.NOT_FOUND:
          return { status, body: { kind: "not_found", message } };
        case HttpStatus.CONFLICT:
          return { status, body: { kind: "conflict", message } };
        case HttpStatus.TOO_MANY_REQUESTS:
          return { status, body: { kind: "rate_limited", message } };
        default:
          // 4xx/5xx codes not in the discriminated union → server_error bucket
          // (preserves the original status code; just generalizes the kind).
          return { status, body: { kind: "server_error", message } };
      }
    }

    // Truly unknown — log full detail server-side, NEVER leak to client.
    this.logger.error(
      "Unhandled exception",
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { kind: "server_error", message: "Internal server error" },
    };
  }

  /**
   * Nest's HttpException payload can be a string OR an object with a
   * `message` field (ValidationPipe shape: `{ statusCode, message: [...], error }`).
   * Pull the human-readable string for the wire format.
   */
  private extractMessage(resp: string | object, fallback: string): string {
    if (typeof resp === "string") return resp;
    const obj = resp as { message?: unknown };
    if (typeof obj.message === "string") return obj.message;
    if (Array.isArray(obj.message)) return obj.message.join("; ");
    return fallback;
  }

  private extractHealthProbeBody(resp: unknown): HealthProbeBody | null {
    if (this.isHealthProbeBody(resp)) return resp;
    if (typeof resp !== "object" || resp === null) return null;

    const message = (resp as { message?: unknown }).message;
    if (this.isHealthProbeBody(message)) return message;
    return null;
  }

  private isHealthProbeBody(body: unknown): body is HealthProbeBody {
    if (typeof body !== "object" || body === null) return false;

    const candidate = body as {
      status?: unknown;
      info?: unknown;
      error?: unknown;
      details?: unknown;
    };
    if (candidate.status !== "ok" && candidate.status !== "error") return false;
    return (
      this.isOptionalRecord(candidate.info) &&
      this.isOptionalRecord(candidate.error) &&
      this.isOptionalRecord(candidate.details)
    );
  }

  private isOptionalRecord(value: unknown): value is Record<string, unknown> | undefined {
    return value === undefined || (typeof value === "object" && value !== null);
  }
}
