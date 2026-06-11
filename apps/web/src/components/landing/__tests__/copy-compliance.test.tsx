import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import LandingPage from "@/app/page";

/**
 * Copy-compliance gate (LAND-01d) — extends the COMP-01 verdict enum invariant
 * to the marketing surface. Scans the full rendered landing DOM (including
 * JSON-LD script bodies) against the SEBI forbid-list and fails the build on
 * any hit. Fix offending copy in data.ts / section files — never weaken the
 * test.
 *
 * Single tokens use word-boundary matching (`\bword\b`, case-insensitive) so
 * benign substrings ("holding" / "holdings") do not trip "hold". Multi-word
 * phrases use case-insensitive substring matching.
 */
const FORBIDDEN = [
  "buy",
  "sell",
  "hold",
  "recommend",
  "recommended",
  "guaranteed",
  "guarantee",
  "assured returns",
  "risk-free",
  "best stocks",
  "top picks",
  "multibagger",
  "target price",
  "sure shot",
  "sureshot",
  "profit guaranteed",
] as const;

describe("landing copy compliance (extends COMP-01 verdict enum to marketing)", () => {
  it.each(FORBIDDEN)(
    'does not contain the forbidden marketing verb/phrase "%s"',
    (word) => {
      const { container } = render(<LandingPage />);
      const text = container.textContent ?? "";
      const ldJson = Array.from(
        container.querySelectorAll('script[type="application/ld+json"]'),
      )
        .map((s) => s.textContent ?? "")
        .join(" ");
      const fullText = `${text} ${ldJson}`.toLowerCase();

      if (word.includes(" ")) {
        expect(
          fullText,
          `Forbidden marketing phrase "${word}" detected in landing copy. Per SEBI compliance + COMP-01, the marketing surface may not use trading/promise language.`,
        ).not.toContain(word.toLowerCase());
      } else {
        expect(
          fullText,
          `Forbidden marketing verb "${word}" detected in landing copy. Per SEBI compliance + COMP-01, the marketing surface may not use trading verbs.`,
        ).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
      }
    },
  );
});
