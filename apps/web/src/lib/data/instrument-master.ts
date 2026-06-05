/**
 * Instrument-master reads for the public SEO pages:
 *   - `getTopNTickers` / `getTopNFundSchemeCodes` feed `generateStaticParams`
 *     (build-time prerender of the top cohort).
 *   - `getStockInstrument` resolves dual-listing metadata (`primaryExchange`,
 *     `nseSymbol`) so the canonical URL can prefer NSE for dual-listed stocks.
 *
 * CROSS-PHASE DEPENDENCY (Phase 2 instrument master):
 * There is currently NO public, unauthenticated NestJS endpoint exposing the
 * top-N instrument lists or a single-instrument lookup. The only instruments
 * endpoint (`GET /search/instruments`) is behind `AccessTokenGuard`, so a
 * build-time / crawler request cannot use it.
 *
 * Until Phase 2 exposes a public materialised endpoint (e.g.
 * `GET /instruments/public/top?type=stock&n=500` and
 * `GET /instruments/public/:nseSymbol`), these functions return the empty /
 * null fallback:
 *   - `generateStaticParams` prerenders 0 routes; the long tail renders
 *     on-demand via ISR (`dynamicParams = true`, `revalidate = 86400`). This
 *     is correct and complete behaviour — just no build-time prerender yet.
 *   - dual-listing canonical falls back to the route symbol (NSE-symbol-as-
 *     ticker is the common case), which is correct for every non-dual-listed
 *     stock and for NSE-routed dual listings.
 *
 * TODO(phase-2): wire these to the public instrument-master endpoint when it
 * lands; flip the env flag `PUBLIC_INSTRUMENTS_BASE` to enable.
 */
import "server-only";
import type { InstrumentDto } from "@finsight/shared";

const PUBLIC_INSTRUMENTS_BASE = process.env.PUBLIC_INSTRUMENTS_BASE;
const TOPN_TTL_SECONDS = 24 * 60 * 60;

export interface TickerParam {
  readonly symbol: string;
}

export interface FundSchemeParam {
  readonly schemeCode: string;
}

export async function getTopNTickers(n: number): Promise<TickerParam[]> {
  if (!PUBLIC_INSTRUMENTS_BASE) return [];
  try {
    const res = await fetch(
      `${PUBLIC_INSTRUMENTS_BASE}/instruments/public/top?type=stock&n=${n}`,
      { next: { tags: ["instruments:top-stock"], revalidate: TOPN_TTL_SECONDS } },
    );
    if (!res.ok) return [];
    return (await res.json()) as TickerParam[];
  } catch {
    // Build-time fetch failures must not break the build — fall back to
    // on-demand ISR (the long tail still renders).
    return [];
  }
}

export async function getTopNFundSchemeCodes(
  n: number,
): Promise<FundSchemeParam[]> {
  if (!PUBLIC_INSTRUMENTS_BASE) return [];
  try {
    const res = await fetch(
      `${PUBLIC_INSTRUMENTS_BASE}/instruments/public/top?type=fund&n=${n}`,
      { next: { tags: ["instruments:top-fund"], revalidate: TOPN_TTL_SECONDS } },
    );
    if (!res.ok) return [];
    return (await res.json()) as FundSchemeParam[];
  } catch {
    return [];
  }
}

/**
 * Resolves instrument metadata for dual-listing canonical preference.
 * Returns `null` until the public endpoint exists (canonical then falls back
 * to the route symbol, which is correct for the NSE-routed common case).
 */
export async function getStockInstrument(
  symbol: string,
): Promise<InstrumentDto | null> {
  if (!PUBLIC_INSTRUMENTS_BASE) return null;
  try {
    const res = await fetch(
      `${PUBLIC_INSTRUMENTS_BASE}/instruments/public/${symbol}`,
      { next: { tags: [`instrument:${symbol}`], revalidate: TOPN_TTL_SECONDS } },
    );
    if (!res.ok) return null;
    return (await res.json()) as InstrumentDto;
  } catch {
    return null;
  }
}
