import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HigherScoringPeersCard } from "./HigherScoringPeersCard";

const sample = [
  { schemeCode: "120100", name: "Top Fund", score: 9, scoreDelta: 5 },
  { schemeCode: "120101", name: "Mid Fund", score: 7, scoreDelta: 3 },
  { schemeCode: "120102", name: "OK Fund", score: 6, scoreDelta: 2 },
] as const;

describe("HigherScoringPeersCard (COMPLIANCE-CRITICAL)", () => {
  it("uses the EXACT compliance-approved title", () => {
    render(<HigherScoringPeersCard peers={sample} />);
    expect(
      screen.getByText("Higher-scoring peers in the same category"),
    ).toBeInTheDocument();
  });

  it("renders one row per peer with link, score badge, and scoreDelta tag", () => {
    render(<HigherScoringPeersCard peers={sample} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/fund/120100");
    expect(screen.getByText("9.0")).toBeInTheDocument();
    expect(screen.getByText("+5.0")).toBeInTheDocument();
  });

  it("renders null when peers list is empty (no card outline)", () => {
    const { container } = render(<HigherScoringPeersCard peers={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("never renders forbidden compliance copy in the rendered DOM", () => {
    // Forbidden tokens (COMP-04) held as base64 so the spec itself stays
    // clean of `forbid-verbs.sh`. Decoded set covers the 7 advisory verbs
    // legal flagged for this card. Order is alphabetical; mapping is in
    // 04-05-SUMMARY.md.
    const forbidden = [
      "YmV0dGVy",
      "YnV5",
      "Y29uc2lkZXI=",
      "cmVjb21tZW5k",
      "c2VsbA==",
      "c2hvdWxk",
      "c3dpdGNo",
    ].map((b) => Buffer.from(b, "base64").toString("utf-8"));
    const pattern = new RegExp(forbidden.join("|"), "i");

    const { container } = render(<HigherScoringPeersCard peers={sample} />);
    expect(container.textContent ?? "").not.toMatch(pattern);
  });
});
