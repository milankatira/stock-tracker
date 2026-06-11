// TODO(i18n): wire copy through t() when the i18n helper ships.
import Link from "next/link";
import { JsonLd } from "@/components/seo/json-ld";

/**
 * Footer — 4-column link grid + SEBI note. Server Component.
 * Organization JSON-LD is injected in Task 2 for separation of concerns.
 * Note: /privacy, /terms, /login, /about, /blog, /contact route stubs are
 * out of scope for this plan — links are correct but may 404 until shipped.
 */
interface FooterLink {
  readonly label: string;
  readonly href: string;
}

const columns: ReadonlyArray<{ heading: string; links: readonly FooterLink[] }> =
  [
    {
      heading: "Product",
      links: [
        { label: "Features", href: "#features" },
        { label: "Pricing", href: "#pricing" },
        { label: "Sample Report", href: "#sample" },
      ],
    },
    {
      heading: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Blog", href: "/blog" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
        { label: "SEBI Note", href: "#sebi-note" },
      ],
    },
    {
      heading: "Connect",
      links: [
        { label: "Twitter", href: "https://twitter.com/finsight_ai" },
        {
          label: "LinkedIn",
          href: "https://www.linkedin.com/company/finsight-ai",
        },
      ],
    },
  ];

export function Footer() {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://finsight.ai";
  // Organization JSON-LD — typed object, JSON.stringify is injection-safe.
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "FinSight AI",
    url: site,
    logo: `${site}/og/landing-v1.png`,
    description:
      "AI-powered investment analysis for Indian stocks and mutual funds. Analysis, not advice.",
    sameAs: [
      "https://twitter.com/finsight_ai",
      "https://www.linkedin.com/company/finsight-ai",
    ],
  };

  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {columns.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h3 className="text-sm font-semibold text-foreground">
                {col.heading}
              </h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p
          id="sebi-note"
          className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground"
        >
          FinSight AI is not a SEBI-registered Research Analyst. All content is
          analysis, not advice.
        </p>
      </div>
      <JsonLd data={orgJsonLd} />
    </footer>
  );
}
