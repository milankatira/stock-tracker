// TODO(i18n): wire copy through t() when the i18n helper ships.
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Hero — first section of the marketing landing page. Server Component.
 * Primary CTA → /signup (Phase-1 auth), secondary CTA anchors to #sample.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-brand-50 to-background">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
        <div className="text-center lg:text-left">
          <Badge variant="secondary" className="mb-4">
            Analysis, not advice
          </Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Plain-English score, verdict, and reasoning for any Indian stock or
            mutual fund — in under 2 seconds.
          </h1>
          <p className="mt-6 text-pretty text-lg text-muted-foreground sm:text-xl">
            FinSight AI distills NSE, BSE, and AMFI data into a single 1–10
            score with a worded verdict, six insight cards, and a conversational
            AI you can ask &ldquo;why?&rdquo;.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
            <Button asChild size="lg" className="min-h-11 w-full sm:w-auto">
              {/* prefetch disabled: /signup ships in a later phase (Phase 1). */}
              <Link href="/signup" prefetch={false}>
                Get started — free
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="min-h-11 w-full sm:w-auto"
            >
              <Link href="#sample">See sample report</Link>
            </Button>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <Image
            src="/landing/sample-report-hdfc.png"
            alt="FinSight AI sample report for HDFC Bank showing a FinSight Score of 7 out of 10 with a Strong Score verdict"
            width={640}
            height={520}
            priority
            sizes="(max-width: 1024px) 100vw, 640px"
            className="rounded-2xl border border-border shadow-2xl"
          />
        </div>
      </div>
    </section>
  );
}
