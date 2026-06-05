/**
 * Materialised-store read path for the PUBLIC fund SEO page (SEO-04).
 *
 * Mirror of `stock-report.ts`: cookieless internal-HTTP read of the
 * precomputed fund report, tagged for `revalidateTag`. No live model call,
 * no live external data on the crawler request path.
 */
import "server-only";
import type { FundReportDoc } from "@finsight/shared";
import {
  type MaterialisedReadOptions,
} from "./stock-report";

const API_BASE =
  process.env.API_BASE ??
  process.env.INTERNAL_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:3001";

const REPORT_TTL_SECONDS = 24 * 60 * 60;

function internalHeaders(): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret) headers["x-internal-secret"] = secret;
  return headers;
}

export async function getFundReportFromMaterialisedStore(
  schemeCode: string,
  options: MaterialisedReadOptions,
): Promise<FundReportDoc | null> {
  const res = await fetch(`${API_BASE}/reports/fund/${schemeCode}`, {
    headers: internalHeaders(),
    next: { tags: [...options.cacheTags], revalidate: REPORT_TTL_SECONDS },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `Fund report fetch failed for ${schemeCode}: ${res.status}`,
    );
  }
  return (await res.json()) as FundReportDoc;
}

/** Fire-and-forget ad-hoc compute enqueue for a long-tail fund. */
export async function enqueueAdHocFundCompute(
  schemeCode: string,
): Promise<void> {
  try {
    await fetch(`${API_BASE}/jobs/ad-hoc-compute/fund/${schemeCode}`, {
      method: "POST",
      headers: internalHeaders(),
      cache: "no-store",
    });
  } catch (error: unknown) {
    console.warn(
      `Ad-hoc fund compute enqueue failed for ${schemeCode}:`,
      error instanceof Error ? error.message : error,
    );
  }
}
