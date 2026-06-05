/**
 * Per-fund Open Graph image for the public fund page (SEO-03).
 *
 * Mirror of the stock OG route: reads the precomputed fund report from the
 * materialised store (no live Gemini, no live data) and renders the
 * deterministic Fund Score + verdict label as a branded social card.
 *
 * Compliance + fallback + AI-SDK-ban notes are identical to the stock route
 * (see stock/[ticker]/opengraph-image.tsx).
 */
import { ImageResponse } from "next/og";
import { getFundReportFromMaterialisedStore } from "@/lib/data/fund-report";

// Edge runtime per plan (see stock/[ticker]/opengraph-image.tsx for rationale).
export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const VERDICT_LABEL: Record<string, string> = {
  STRONG_SCORE: "Strong Score",
  CAUTION: "Caution",
  WEAK_SCORE: "Weak Score",
};

interface OgImageProps {
  readonly params: Promise<{ readonly schemeCode: string }>;
}

export default async function OgImage({
  params,
}: OgImageProps): Promise<ImageResponse> {
  const { schemeCode } = await params;

  let headline = `Fund ${schemeCode} — FinSight Analysis`;
  let sub = "Deterministic Fund Score & plain-English analysis";

  try {
    const report = await getFundReportFromMaterialisedStore(schemeCode, {
      cacheTags: [`fund:${schemeCode}`, "fund:report"],
    });
    if (report) {
      headline = `${report.name} — FinSight Fund Score ${report.score.value}/10`;
      sub = VERDICT_LABEL[report.score.verdict] ?? "FinSight Analysis";
    }
  } catch {
    // 200 branded card on failure so social embeds always resolve.
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
            fontSize: 64,
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
