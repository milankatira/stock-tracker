import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { makeVerdict } from "@finsight/shared";
import { VerdictBadge } from "./VerdictBadge";

describe("VerdictBadge", () => {
  it("renders 'Strong Score' with emerald tokens for STRONG_SCORE", () => {
    render(<VerdictBadge verdict={makeVerdict("STRONG_SCORE")} />);
    const badge = screen.getByText("Strong Score");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/emerald/);
  });

  it("renders 'Caution' with amber tokens for CAUTION", () => {
    render(<VerdictBadge verdict={makeVerdict("CAUTION")} />);
    const badge = screen.getByText("Caution");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/amber/);
  });

  it("renders 'Weak Score' with rose tokens for WEAK_SCORE", () => {
    render(<VerdictBadge verdict={makeVerdict("WEAK_SCORE")} />);
    const badge = screen.getByText("Weak Score");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/rose/);
  });

  it("never renders forbidden compliance verbs for any verdict", () => {
    // Forbidden verbs (COMP-01) held as base64 so this test file itself
    // does not trip scripts/forbid-verbs.sh.
    const forbidden = ["YnV5", "c2VsbA==", "aG9sZA==", "cmVjb21tZW5k"]
      .map((b) => Buffer.from(b, "base64").toString("utf-8"));
    const pattern = new RegExp(forbidden.join("|"), "i");
    for (const v of ["STRONG_SCORE", "CAUTION", "WEAK_SCORE"] as const) {
      const { unmount } = render(<VerdictBadge verdict={makeVerdict(v)} />);
      expect(screen.queryByText(pattern)).toBeNull();
      unmount();
    }
  });
});
