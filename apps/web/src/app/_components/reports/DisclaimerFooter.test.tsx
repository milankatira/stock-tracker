import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DisclaimerFooter } from "./DisclaimerFooter";

describe("DisclaimerFooter", () => {
  it("always renders the analysis disclaimer with contentinfo role", () => {
    render(
      <DisclaimerFooter
        disclaimers={{ analysis: "Analysis, not investment advice." }}
      />,
    );

    const footer = screen.getByRole("contentinfo");
    expect(footer).toBeInTheDocument();
    expect(
      screen.getByText("Analysis, not investment advice."),
    ).toBeInTheDocument();
  });

  it("renders the past-performance disclaimer when provided", () => {
    render(
      <DisclaimerFooter
        disclaimers={{
          analysis: "Analysis, not investment advice.",
          pastPerformance: "Past performance does not guarantee future results.",
        }}
      />,
    );

    expect(
      screen.getByText("Past performance does not guarantee future results."),
    ).toBeInTheDocument();
  });

  it("omits the past-performance section when undefined", () => {
    render(
      <DisclaimerFooter
        disclaimers={{ analysis: "Analysis, not investment advice." }}
      />,
    );

    expect(
      screen.queryByText(/past performance/i),
    ).not.toBeInTheDocument();
  });
});
