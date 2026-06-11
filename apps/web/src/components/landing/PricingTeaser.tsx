// TODO(i18n): wire copy through t() when the i18n helper ships.
import Link from "next/link";
import { Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pricingTiers } from "./data";

/**
 * Pricing teaser — 3 tiers. Free is fully clickable (→ /signup); Pro and
 * Premium carry a "Coming soon" badge with a disabled CTA (honest framing
 * pre-monetisation). Server Component.
 */
export function PricingTeaser() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
    >
      <h2
        id="pricing-heading"
        className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl"
      >
        Simple pricing
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
        Start free. Upgrade when you need more.
      </p>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {pricingTiers.map((tier) => (
          <Card key={tier.name} className="flex h-full flex-col">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">{tier.name}</CardTitle>
                {tier.comingSoon ? (
                  <Badge variant="secondary">Coming soon</Badge>
                ) : null}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">
                  {tier.price}
                </span>
                <span className="text-sm text-muted-foreground">
                  {tier.cadence}
                </span>
              </div>
              <CardDescription className="mt-2">{tier.tagline}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              {tier.comingSoon ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  aria-disabled="true"
                  className="min-h-11 w-full"
                >
                  Notify me
                </Button>
              ) : (
                <Button asChild className="min-h-11 w-full">
                  {/* prefetch disabled: /signup ships in a later phase (Phase 1). */}
                  <Link href="/signup" prefetch={false}>
                    Get started — free
                  </Link>
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
}
