import { cookies } from "next/headers";
import type { StockReportDoc } from "@finsight/shared";

/**
 * Server-only fetch wrappers around the NestJS report API.
 *
 * Uses Next.js fetch tag-based revalidation (`next: { tags }`) so the
 * `/api/internal/revalidate` route handler can call `revalidateTag()` on
 * receipt of an HMAC-signed webhook from `ReportsService.bustCache`
 * (Plan 04-03), invalidating only the affected ticker.
 *
 * Auth: NestJS expects an `access_token` cookie. We forward it as a
 * `Cookie` header on the outgoing fetch because RSC fetches do not
 * propagate browser cookies automatically.
 */
const INTERNAL_BASE =
  process.env.INTERNAL_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

const ACCESS_COOKIE_NAME = "access_token";
const STOCK_REPORT_TTL_SECONDS = 24 * 60 * 60;

export class ReportFetchError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ReportFetchError";
  }
}

export async function getStockReport(
  ticker: string,
): Promise<StockReportDoc | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value;

  const headers: Record<string, string> = {
    accept: "application/json",
  };
  if (accessToken) {
    headers["cookie"] = `${ACCESS_COOKIE_NAME}=${accessToken}`;
  }

  const res = await fetch(`${INTERNAL_BASE}/reports/stock/${ticker}`, {
    headers,
    next: { tags: [`stock:${ticker}`], revalidate: STOCK_REPORT_TTL_SECONDS },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ReportFetchError(
      res.status,
      `Report fetch failed: ${res.status}`,
    );
  }

  return (await res.json()) as StockReportDoc;
}
