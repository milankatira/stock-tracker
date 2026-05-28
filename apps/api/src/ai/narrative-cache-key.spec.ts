import { describe, expect, it } from "vitest";
import { buildNarrativeCacheKey } from "./narrative-cache-key";

describe("buildNarrativeCacheKey", () => {
  it("composes the prefixed key from ticker + hash", () => {
    expect(buildNarrativeCacheKey("RELIANCE", "abc123")).toBe(
      "gemini-ctx:RELIANCE:abc123",
    );
  });

  it("treats different hashes as different keys (versioned invalidation)", () => {
    const a = buildNarrativeCacheKey("RELIANCE", "v1");
    const b = buildNarrativeCacheKey("RELIANCE", "v2");
    expect(a).not.toBe(b);
  });

  it("throws when ticker is empty", () => {
    expect(() => buildNarrativeCacheKey("", "abc")).toThrow(/ticker required/);
  });

  it("throws when dataVersionHash is empty", () => {
    expect(() => buildNarrativeCacheKey("X", "")).toThrow(
      /dataVersionHash required/,
    );
  });
});
