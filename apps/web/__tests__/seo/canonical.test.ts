import { describe, it, expect } from "vitest";
import {
  buildCanonicalStockUrl,
  buildCanonicalFundUrl,
} from "@/lib/seo/canonical";

const SITE = "https://finsight.ai";

describe("buildCanonicalStockUrl (SEO-03b)", () => {
  it("uses the ticker for a plain NSE listing", () => {
    expect(buildCanonicalStockUrl({ symbol: "RELIANCE", exchange: "NSE" })).toBe(
      `${SITE}/stock/RELIANCE`,
    );
  });

  it("prefers the NSE symbol for a dual-listed BSE route param", () => {
    expect(
      buildCanonicalStockUrl({
        symbol: "500325",
        exchange: "BSE",
        nseSymbol: "RELIANCE",
      }),
    ).toBe(`${SITE}/stock/RELIANCE`);
  });

  it("falls back to the BSE symbol when no NSE listing exists", () => {
    expect(
      buildCanonicalStockUrl({ symbol: "TATAINFRA", exchange: "BSE" }),
    ).toBe(`${SITE}/stock/TATAINFRA`);
  });
});

describe("buildCanonicalFundUrl (SEO-03b)", () => {
  it("uses the AMFI scheme code", () => {
    expect(buildCanonicalFundUrl({ schemeCode: "120503" })).toBe(
      `${SITE}/fund/120503`,
    );
  });
});
