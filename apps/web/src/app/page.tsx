// Marketing landing page (Phase 9, LAND-01 / LAND-02).
//
// `/` was previously the interim ReportWorkspace demo; the roadmap places the
// public marketing landing page last and repurposes `/` for it. The report
// tool lives at /search and /app/stock/*, /app/fund/*.
//
// Static Server Component — no data fetching, no auth, force-static so the
// fully-rendered HTML is served from the edge and is crawler-indexable.
// `metadata` export (OG / canonical) is added in Task 2.
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
