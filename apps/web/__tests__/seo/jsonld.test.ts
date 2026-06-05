import { describe, it, expect } from "vitest";
import {
  buildStockJsonLd,
  buildFundJsonLd,
  buildBreadcrumbJsonLd,
} from "@/lib/seo/jsonld";
import { stockFixture, fundFixture } from "../fixtures/instrument-master";

/**
 * Recursively collect every object key in a JSON-LD payload so we can assert
 * the SEBI-safety invariant: NO `review` / `aggregateRating` / `rating`
 * anywhere. The FinSight Score must never be emitted as a machine-readable
 * Rating/Review entity.
 */
function collectKeys(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      acc.add(k.toLowerCase());
      collectKeys(v, acc);
    }
  }
  return acc;
}

function typeValues(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) typeValues(item, acc);
  } else if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec["@type"] === "string") acc.add(rec["@type"] as string);
    for (const v of Object.values(rec)) typeValues(v, acc);
  }
  return acc;
}

describe("buildStockJsonLd (SEO-03a)", () => {
  const blocks = buildStockJsonLd(stockFixture, {
    exchange: "NSE",
    canonicalUrl: "https://finsight.ai/stock/RELIANCE",
  });

  it("returns a Corporation + Article pair", () => {
    expect(blocks).toHaveLength(2);
    const [corp, article] = blocks as unknown as Record<string, unknown>[];
    expect(corp["@type"]).toBe("Corporation");
    expect(article["@type"]).toBe("Article");
  });

  it("emits a space-separated exchange tickerSymbol", () => {
    const [corp] = blocks as unknown as Record<string, unknown>[];
    expect(corp.tickerSymbol).toBe("NSE RELIANCE");
  });

  it("never emits Review / Rating / aggregateRating (SEBI safety)", () => {
    const keys = collectKeys(blocks);
    expect(keys.has("review")).toBe(false);
    expect(keys.has("aggregaterating")).toBe(false);
    expect(keys.has("rating")).toBe(false);
    const types = typeValues(blocks);
    expect(types.has("Review")).toBe(false);
    expect(types.has("Rating")).toBe(false);
  });
});

describe("buildFundJsonLd (SEO-03a)", () => {
  const blocks = buildFundJsonLd(fundFixture, {
    canonicalUrl: "https://finsight.ai/fund/120503",
  });

  it("returns a FinancialProduct + Article pair", () => {
    expect(blocks).toHaveLength(2);
    const [product, article] = blocks as unknown as Record<string, unknown>[];
    expect(product["@type"]).toBe("FinancialProduct");
    expect(article["@type"]).toBe("Article");
  });

  it("sets provider from the fund category metadata", () => {
    const [product] = blocks as unknown as Record<string, unknown>[];
    expect(product.provider).toBeDefined();
  });

  it("never emits Review / Rating / aggregateRating (SEBI safety)", () => {
    const keys = collectKeys(blocks);
    expect(keys.has("review")).toBe(false);
    expect(keys.has("aggregaterating")).toBe(false);
    expect(keys.has("rating")).toBe(false);
  });
});

describe("buildBreadcrumbJsonLd (SEO-03a)", () => {
  it("returns a 3-level BreadcrumbList for stocks", () => {
    const crumb = buildBreadcrumbJsonLd({
      level2: { name: "Stocks", url: "https://finsight.ai/stock" },
      leaf: {
        name: "Reliance Industries Ltd",
        url: "https://finsight.ai/stock/RELIANCE",
      },
    }) as unknown as Record<string, unknown>;
    expect(crumb["@type"]).toBe("BreadcrumbList");
    expect(crumb.itemListElement).toHaveLength(3);
  });
});
