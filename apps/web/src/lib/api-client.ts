import { isApiError, type ApiError } from "@finsight/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    // RSC fetches default to caching; opt out for now. Reports/SEO pages
    // (Phase 8) will re-enable caching with explicit revalidate hints.
    cache: init?.cache ?? "no-store",
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON or empty body — keep `body` null and let downstream
    // checks handle it. Explicit empty catch is intentional here:
    // the failure is captured by the `!res.ok` branch below.
    body = null;
  }

  if (!res.ok) {
    if (isApiError(body)) throw body;
    const fallback: ApiError = {
      kind: "server_error",
      message: `HTTP ${res.status}`,
    };
    throw fallback;
  }

  return body as T;
}
