/**
 * Long-tail stub for a stock/fund with no precomputed report yet.
 *
 * Rendered when the materialised store returns null. The page sets
 * `robots: { index: false }` in `generateMetadata` so this thin page is never
 * indexed; once the ad-hoc compute job lands the report, ISR revalidation
 * swaps in the full indexable page.
 *
 * NO score, NO verdict, NO entity JSON-LD block (the page still emits Article
 * + BreadcrumbList so crawlers see structure). Disclaimers ARE present —
 * every public page carries them (threat T-08-09).
 */
import type { ReactElement } from "react";

interface StubPageProps {
  readonly type: "stock" | "fund";
  readonly identifier: string;
}

export function StubPage({ type, identifier }: StubPageProps): ReactElement {
  const label = type === "stock" ? identifier : `scheme ${identifier}`;
  return (
    <section className="container mx-auto max-w-3xl space-y-6 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        We&apos;re computing analysis for {label}
      </h1>
      <p className="text-muted-foreground">
        This usually takes a minute — refresh shortly. Meanwhile, explore
        similar instruments.
      </p>
      <a
        href="/"
        className="inline-block rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
      >
        Back to search
      </a>
    </section>
  );
}
