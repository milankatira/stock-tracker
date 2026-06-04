import { cookies } from "next/headers";
import type { ComparisonVerdict, PendingScoreResponse } from "@finsight/shared";

/**
 * Server-only client for the NestJS `POST /compare` endpoint (STOCK-07).
 *
 * Auth: NestJS expects an `access_token` cookie. RSC fetches do not
 * propagate browser cookies automatically, so we forward it explicitly as a
 * `Cookie` header (same pattern as `_lib/reports/fetch.ts`).
 *
 * A 422 means at least one input has no persisted score yet — returned as a
 * typed `PendingScoreResponse` so the page can render a friendly
 * "try again tomorrow" card rather than throwing.
 */
const INTERNAL_BASE =
  process.env.INTERNAL_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

const ACCESS_COOKIE_NAME = "access_token";

export async function compareInstruments(
  symbols: readonly string[],
): Promise<ComparisonVerdict | PendingScoreResponse> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (accessToken) {
    headers["cookie"] = `${ACCESS_COOKIE_NAME}=${accessToken}`;
  }

  const res = await fetch(`${INTERNAL_BASE}/compare`, {
    method: "POST",
    headers,
    body: JSON.stringify({ symbols }),
    cache: "no-store",
  });

  if (res.status === 422) {
    return (await res.json()) as PendingScoreResponse;
  }
  if (!res.ok) {
    throw new Error(`compare_failed_${res.status}`);
  }
  return (await res.json()) as ComparisonVerdict;
}
