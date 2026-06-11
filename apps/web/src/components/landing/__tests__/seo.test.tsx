import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { metadata } from "@/app/page";
import { FAQ } from "@/components/landing/FAQ";
import { Footer } from "@/components/landing/Footer";

/**
 * SEO contract for the landing page (LAND-01e).
 *
 * Next.js processes the `metadata` export into <head> at framework level, not
 * via React render — so canonical/OG are asserted against the exported object.
 * JSON-LD scripts ARE rendered into the component tree, so they are asserted
 * via the rendered DOM.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://finsight.ai";

describe("landing SEO metadata + JSON-LD", () => {
  it("declares a canonical URL on the site origin", () => {
    const canonical = metadata.alternates?.canonical;
    expect(typeof canonical === "string" ? canonical : "").toContain(SITE);
  });

  it("declares an OG image ending in /og/landing-v1.png", () => {
    const images = metadata.openGraph?.images;
    const list = Array.isArray(images) ? images : images ? [images] : [];
    const urls = list.map((img) =>
      typeof img === "string"
        ? img
        : typeof img === "object" && img && "url" in img
          ? String((img as { url: unknown }).url)
          : "",
    );
    expect(urls.some((u) => u.endsWith("/og/landing-v1.png"))).toBe(true);
  });

  it("renders FAQPage JSON-LD", () => {
    const { container } = render(<FAQ />);
    const scripts = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => s.textContent ?? "");
    expect(scripts.join(" ")).toContain('"@type":"FAQPage"');
  });

  it("renders Organization JSON-LD with name FinSight AI", () => {
    const { container } = render(<Footer />);
    const scripts = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => s.textContent ?? "");
    const joined = scripts.join(" ");
    expect(joined).toContain('"@type":"Organization"');
    expect(joined).toContain('"name":"FinSight AI"');
  });
});
