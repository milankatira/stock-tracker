import { isApiError, type ApiError, type ScoreResult } from "@finsight/shared";

export interface SavedReportAsset {
  readonly name: string;
  readonly type: "stock";
  readonly symbol: string;
}

export interface SavedReportQuote {
  readonly symbol: string;
  readonly price: number;
  readonly currency: "INR";
  readonly asOf: string;
  readonly source: string;
}

export interface SavedReportGeneration {
  readonly requestHash: string;
  readonly requestedAt: string;
  readonly completedAt?: string;
  readonly failedAt?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface SavedReport {
  readonly id: string;
  readonly status: "queued" | "running" | "completed" | "failed";
  readonly asset: SavedReportAsset;
  readonly quote: SavedReportQuote;
  readonly score: ScoreResult;
  readonly citations: readonly string[];
  readonly narrative: string;
  readonly generation: SavedReportGeneration;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SavedReportList {
  readonly items: readonly SavedReport[];
  readonly nextCursor: string | null;
}

export interface CreateSavedReportInput {
  readonly assetName: string;
  readonly assetType: "stock";
  readonly symbol: string;
  readonly valuation: number;
  readonly growth: number;
  readonly profitability: number;
  readonly balanceSheet: number;
  readonly momentum: number;
  readonly risk: number;
}

export interface ListSavedReportsOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly symbol?: string;
}

export interface AuthenticatedSession {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly provider: "local" | "google";
  };
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_HEADER = "x-csrf-token";

/**
 * Typed fetch wrapper that:
 *  - Forwards cookies (`credentials: 'include'`) so the HttpOnly auth
 *    cookie is sent on cross-origin RSC fetches.
 *  - Sets the JSON content-type.
 *  - Throws a typed `ApiError` on non-2xx responses (validated by the
 *    runtime guard from `@finsight/shared`) — callers can `catch` and
 *    narrow on `err.kind`.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  if (requiresCsrf(init)) {
    headers.set(CSRF_HEADER, await fetchCsrfToken());
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
    // RSC fetches default to caching; opt out for now. Reports/SEO pages
    // (Phase 8) will re-enable caching with explicit revalidate hints.
    cache: init?.cache ?? "no-store",
  });

  const body = await readJson(res);

  if (!res.ok) {
    const apiError = extractApiError(body);
    if (apiError) throw apiError;
    const fallback: ApiError = {
      kind: "server_error",
      message: `HTTP ${res.status}`,
    };
    throw fallback;
  }

  return body as T;
}

function requiresCsrf(init?: RequestInit): boolean {
  const method = (init?.method ?? "GET").toUpperCase();
  return !SAFE_METHODS.has(method);
}

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${BASE}/auth/csrf`, {
    credentials: "include",
    cache: "no-store",
  });
  const body = await readJson(res);

  if (res.ok && isCsrfTokenResponse(body)) {
    return body.token;
  }

  const error: ApiError = {
    kind: "server_error",
    message: "Unable to prepare secure request",
  };
  throw error;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    // Empty/non-JSON response bodies are handled by the caller's status checks.
    return null;
  }
}

function isCsrfTokenResponse(value: unknown): value is { token: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "token" in value &&
    typeof value.token === "string" &&
    value.token.length > 0
  );
}

function extractApiError(value: unknown): ApiError | null {
  if (isApiError(value)) return value;
  if (typeof value !== "object" || value === null || !("error" in value)) return null;
  const envelope = value as { error: unknown };
  return isApiError(envelope.error) ? envelope.error : null;
}

export function createSavedReport(input: CreateSavedReportInput): Promise<SavedReport> {
  return apiFetch<SavedReport>("/reports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listSavedReports(
  options: ListSavedReportsOptions = {},
): Promise<SavedReportList> {
  const params = new URLSearchParams();
  if (typeof options.limit === "number") params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.symbol) params.set("symbol", options.symbol);
  const query = params.toString();
  return apiFetch<SavedReportList>(query ? `/reports?${query}` : "/reports");
}

export function getSavedReport(id: string): Promise<SavedReport> {
  return apiFetch<SavedReport>(`/reports/${encodeURIComponent(id)}`);
}

export async function fetchCurrentSession(): Promise<AuthenticatedSession | null> {
  try {
    return await apiFetch<AuthenticatedSession>("/auth/me");
  } catch (err) {
    if (isApiError(err) && err.kind === "unauthorized") return null;
    throw err;
  }
}
