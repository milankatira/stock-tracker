import { cookies } from "next/headers";
import type { FundReportDoc } from "@finsight/shared";

const INTERNAL_BASE =
  process.env.INTERNAL_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

const ACCESS_COOKIE_NAME = "access_token";
const FUND_REPORT_TTL_SECONDS = 24 * 60 * 60;

export class FundReportFetchError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "FundReportFetchError";
  }
}

export async function getFundReport(
  schemeCode: string,
): Promise<FundReportDoc | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value;

  const headers: Record<string, string> = { accept: "application/json" };
  if (accessToken) {
    headers["cookie"] = `${ACCESS_COOKIE_NAME}=${accessToken}`;
  }

  const res = await fetch(`${INTERNAL_BASE}/reports/fund/${schemeCode}`, {
    headers,
    next: { tags: [`fund:${schemeCode}`], revalidate: FUND_REPORT_TTL_SECONDS },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new FundReportFetchError(
      res.status,
      `Fund report fetch failed: ${res.status}`,
    );
  }

  return (await res.json()) as FundReportDoc;
}
