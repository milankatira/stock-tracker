// Marketing landing page (Phase 9, LAND-01 / LAND-02).
//
// `/` was previously the interim ReportWorkspace demo; the roadmap places the
// public marketing landing page last and repurposes `/` for it. The report
// tool lives at /search and /app/stock/*, /app/fund/*.
//
// Static Server Component — no data fetching, no auth, force-static so the
// fully-rendered HTML is served from the edge and is crawler-indexable.
import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { SampleReport } from "@/components/landing/SampleReport";
import { Features } from "@/components/landing/Features";
import { Personas } from "@/components/landing/Personas";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { PricingTeaser } from "@/components/landing/PricingTeaser";
import { ComplianceStrip } from "@/components/landing/ComplianceStrip";
import { FAQ } from "@/components/landing/FAQ";
import { Footer } from "@/components/landing/Footer";

export const dynamic = "force-static";
export const revalidate = false;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://finsight.ai";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title:
    "FinSight AI — AI-powered stock & mutual fund analysis for India",
  description:
    "Plain-English score, verdict, and reasoning for any Indian stock or mutual fund — in under 2 seconds. Analysis, not advice.",
  openGraph: {
    title: "FinSight AI",
    description:
      "Plain-English score, verdict, and reasoning for any Indian stock or mutual fund.",
    type: "website",
    locale: "en_IN",
    url: siteUrl,
    images: [
      {
        url: `${siteUrl}/og/landing-v1.png`,
        width: 1200,
        height: 630,
        alt: "FinSight AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FinSight AI",
    description:
      "Plain-English score, verdict, and reasoning for any Indian stock or mutual fund.",
    images: [`${siteUrl}/og/landing-v1.png`],
  },
  alternates: { canonical: `${siteUrl}/` },
  robots: { index: true, follow: true },
};

export default function LandingPage() {
  return (
    <main>
      <Nav />
      <Hero />
      <SampleReport />
      <Features />
      <Personas />
      <HowItWorks />
      <PricingTeaser />
      <ComplianceStrip />
      <FAQ />
      <Footer />
    </main>
  );
}
