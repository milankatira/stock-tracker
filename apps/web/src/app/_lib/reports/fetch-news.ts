import { cookies } from "next/headers";
import type { NewsFeedItem } from "@finsight/shared";

/**
 * Server-only fetch for a stock's news feed (NEWS-01/02). Mirrors
 * `fetch.ts`: forwards the `access_token` cookie and uses tag-based
 * revalidation so `/api/internal/revalidate` can bust `news:${ticker}`
 * when fresh items land. The API endpoint is public, but forwarding the
 * cookie is harmless and keeps the call pattern uniform.
 */
const INTERNAL_BASE =
  process.env.INTERNAL_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

const ACCESS_COOKIE_NAME = "access_token";
const NEWS_TTL_SECONDS = 60; // matches the API's Cache-Control hint
const DEFAULT_LIMIT = 10;

export async function getStockNews(
  ticker: string,
  limit: number = DEFAULT_LIMIT,
): Promise<readonly NewsFeedItem[]> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value;

  const headers: Record<string, string> = { accept: "application/json" };
  if (accessToken) {
    headers["cookie"] = `${ACCESS_COOKIE_NAME}=${accessToken}`;
  }

  const res = await fetch(
    `${INTERNAL_BASE}/stocks/${encodeURIComponent(ticker)}/news?limit=${limit}`,
    {
      headers,
      next: { tags: [`news:${ticker}`], revalidate: NEWS_TTL_SECONDS },
    },
  );

  // News is non-critical to the report; degrade gracefully to empty.
  if (!res.ok) return [];
  return (await res.json()) as NewsFeedItem[];
}
