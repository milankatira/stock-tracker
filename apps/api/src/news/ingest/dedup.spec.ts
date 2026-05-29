import { describe, expect, it } from "vitest";
import { canonicalize, hashContent } from "./dedup";

describe("canonicalize", () => {
  it("strips utm_* + gclid + fbclid", () => {
    expect(
      canonicalize(
        "https://example.com/article?id=1&utm_source=twitter&utm_medium=social&gclid=xx&fbclid=yy",
      ),
    ).toBe("https://example.com/article?id=1");
  });

  it("preserves non-tracking query params", () => {
    expect(canonicalize("https://example.com/a?id=42&ref=story")).toBe(
      "https://example.com/a?id=42",
    );
  });

  it("strips trailing fragments", () => {
    expect(canonicalize("https://example.com/a#section")).toBe(
      "https://example.com/a",
    );
  });

  it("returns the input unchanged for malformed urls", () => {
    expect(canonicalize("not-a-url")).toBe("not-a-url");
  });

  it("removes the trailing ? when all params are stripped", () => {
    expect(canonicalize("https://example.com/a?utm_source=x")).toBe(
      "https://example.com/a",
    );
  });
});

describe("hashContent", () => {
  it("is deterministic for the same title + source", () => {
    const a = hashContent("Headline", "moneycontrol");
    const b = hashContent("Headline", "moneycontrol");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is case + whitespace insensitive on the title", () => {
    expect(hashContent("Headline", "src")).toBe(
      hashContent("  HEADLINE  ", "SRC"),
    );
  });

  it("differs when the source differs", () => {
    expect(hashContent("Same", "a")).not.toBe(hashContent("Same", "b"));
  });
});
