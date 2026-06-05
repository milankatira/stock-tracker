/**
 * robots.ts unit tests (SEO-03).
 *
 * Asserts the public report trees are allowed, the authenticated/internal
 * surfaces are disallowed, and the sitemap is linked at the default origin.
 */
import { describe, it, expect } from "vitest";
import robots from "@/app/robots";

const SITE = "https://finsight.ai";

describe("robots (SEO-03)", () => {
  it("allows the public report trees and disallows internal surfaces", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rule.allow).toContain("/stock/");
    expect(rule.allow).toContain("/fund/");
    expect(rule.disallow).toContain("/api/");
    expect(rule.disallow).toContain("/app/");
  });

  it("links the sitemap at the site origin", () => {
    expect(robots().sitemap).toBe(`${SITE}/sitemap.xml`);
  });

  it("sets the canonical host", () => {
    expect(robots().host).toBe(SITE);
  });
});
