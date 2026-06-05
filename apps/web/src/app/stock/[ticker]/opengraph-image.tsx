/**
 * Per-ticker Open Graph image for the public stock page (SEO-03).
 *
 * Rendered by `next/og` `ImageResponse` (Satori) on the Node runtime. Reads
 * the SAME materialised store as the page (no live Gemini, no live data) and
 * renders the deterministic score + verdict label as a branded social card.
 *
 * Compliance: the card never uses BUY/SELL verbs. It renders the verdict label
 * from the typed enum (Strong Score / Caution / Weak Score) and carries the
 * "Analysis, not investment advice." footer verbatim — the same guarantee as
 * the page (threat T-08-20).
 *
 * Long-tail / fetch-failure fallback: if no report exists yet (or the
 * materialised read fails), the function still returns a 200 OK minimal
 * branded card so social embeds always resolve — it never throws.
 *
 * AI-SDK ban (SEO-04): this file reads precomputed data only and never imports
 * the live model SDK. The verdict->label map is inlined here rather than
 * importing the `'use client'` VerdictBadge component, which must not enter the
 * server/image render path.
 */
import { ImageResponse } from "next/og";
import { getStockReportFromMaterialisedStore } from "@/lib/data/stock-report";

// Edge runtime per plan: ImageResponse (Satori) runs on Edge; the data layer
// is fetch-based + `server-only`, both Edge-compatible. The materialised read
// uses the internal-secret header — never NEXT_PUBLIC_ — so the secret stays
// server-side even on Edge.
export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Inlined to avoid importing the client-side VerdictBadge into the image
// render. Mirrors VerdictBadge's COPY map (compliance: no BUY/SELL verbs).
const VERDICT_LABEL: Record<string, string> = {
  STRONG_SCORE: "Strong Score",
  CAUTION: "Caution",
  WEAK_SCORE: "Weak Score",
};

interface OgImageProps {
  readonly params: Promise<{ readonly ticker: string }>;
}

export default async function OgImage({
  params,
}: OgImageProps): Promise<ImageResponse> {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  let headline = `${upper} — FinSight Analysis`;
  let sub = "Deterministic score & plain-English analysis";

  try {
    const report = await getStockReportFromMaterialisedStore(upper, {
      cacheTags: [`stock:${upper}`, "stock:report"],
    });
    if (report) {
      headline = `${report.name} — FinSight Score ${report.score.value}/10`;
      sub = VERDICT_LABEL[report.score.verdict] ?? "FinSight Analysis";
    }
  } catch {
    // Fetch/render failures must still yield a 200 branded card so social
    // embeds resolve. Fall through to the default headline/sub.
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          padding: "60px",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.7, marginBottom: 12 }}>
          FinSight AI
        </div>
        <div
          style={{
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.1,
            marginBottom: 24,
          }}
        >
          {headline}
        </div>
        <div style={{ fontSize: 40, opacity: 0.85 }}>{sub}</div>
        <div style={{ fontSize: 22, opacity: 0.6, marginTop: 40 }}>
          Analysis, not investment advice.
        </div>
      </div>
    ),
    { ...size },
  );
}
