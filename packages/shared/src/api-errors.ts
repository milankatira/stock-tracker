/**
 * ApiError — discriminated union for all client-facing error responses.
 *
 * The `kind` field is the discriminant. Add fields per variant as needed,
 * but every variant MUST include `message: string` for client display.
 *
 * NOTE: This is the canonical wire-format error type shared by `apps/api`
 * (which constructs it in the exception filter) and `apps/web` (which
 * narrows on `kind` to render appropriate UI).
 */
export type ApiError =
  | { kind: "validation"; message: string; details?: unknown }
  | { kind: "unauthorized"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "rate_limited"; message: string; retryAfterSec?: number }
  | { kind: "server_error"; message: string };

const KINDS = [
  "validation",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "server_error",
] as const;

export type ApiErrorKind = (typeof KINDS)[number];

/**
 * Runtime type guard for ApiError. Use at boundaries (e.g. parsing a fetch
 * response body) to safely narrow `unknown` to `ApiError`.
 */
export function isApiError(x: unknown): x is ApiError {
  if (typeof x !== "object" || x === null) return false;
  const obj = x as Record<string, unknown>;
  if (typeof obj.kind !== "string") return false;
  if (!(KINDS as readonly string[]).includes(obj.kind)) return false;
  if (typeof obj.message !== "string") return false;
  return true;
}
