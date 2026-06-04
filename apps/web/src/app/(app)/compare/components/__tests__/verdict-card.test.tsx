import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComparisonVerdict } from "@finsight/shared";
import { VERDICTS } from "@finsight/shared";
import { VerdictCard } from "../verdict-card";

function makeVerdict(overrides: Partial<ComparisonVerdict> = {}): ComparisonVerdict {
  return {
    winnerSymbol: "RELIANCE.NS",
    rationale: "RELIANCE.NS is the higher-scoring pick on fundamentals.",
    scoreDelta: 1.45,
    scores: [
      { symbol: "RELIANCE.NS", value: 8.0, verdict: VERDICTS.STRONG_SCORE, asOfDate: "2026-06-01T00:00:00.000Z" },
      { symbol: "TCS.NS", value: 6.5, verdict: VERDICTS.CAUTION, asOfDate: "2026-06-01T00:00:00.000Z" },
    ],
    ...overrides,
  };
}

describe("VerdictCard", () => {
  it("renders the winner symbol, score delta and rationale", () => {
    render(<VerdictCard verdict={makeVerdict()} />);

    expect(screen.getByText("RELIANCE.NS")).toBeInTheDocument();
    expect(
      screen.getByText(/RELIANCE\.NS is the higher-scoring pick/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Higher-scoring pick")).toBeInTheDocument();
  });

  it("formats the score delta to one decimal with a leading +", () => {
    render(<VerdictCard verdict={makeVerdict({ scoreDelta: 1.5 })} />);
    expect(screen.getByText("+1.5 vs next-best")).toBeInTheDocument();
  });

  it("shows the analysis-not-advice disclaimer", () => {
    render(<VerdictCard verdict={makeVerdict()} />);
    expect(
      screen.getByText(/Analysis only — not investment advice/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Past performance does not guarantee future returns/i),
    ).toBeInTheDocument();
  });

  it("renders a zero delta without crashing (tied scores)", () => {
    // Winner is the deterministic argmax, so scoreDelta is always >= 0;
    // a tie produces exactly 0 (no leading + for a non-positive delta).
    render(<VerdictCard verdict={makeVerdict({ scoreDelta: 0 })} />);
    expect(screen.getByText("0.0 vs next-best")).toBeInTheDocument();
  });
});
