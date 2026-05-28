import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskStrip } from "./RiskStrip";

describe("RiskStrip", () => {
  it("renders Sharpe / Std Dev / Max Drawdown labels with their values", () => {
    render(
      <RiskStrip
        data={{ sharpe1y: 1.23, stddev1y: 14.5, maxDrawdown1y: -0.18 }}
      />,
    );
    expect(screen.getByText("Sharpe (1Y)")).toBeInTheDocument();
    expect(screen.getByText("Std Dev (1Y)")).toBeInTheDocument();
    expect(screen.getByText("Max Drawdown (1Y)")).toBeInTheDocument();
    expect(screen.getByText("1.23")).toBeInTheDocument();
    expect(screen.getByText("14.5%")).toBeInTheDocument();
  });

  it("renders Max Drawdown as a negative percentage with rose tone", () => {
    render(
      <RiskStrip
        data={{ sharpe1y: 1, stddev1y: 12, maxDrawdown1y: -0.225 }}
      />,
    );
    const dd = screen.getByText("-22.5%");
    expect(dd).toBeInTheDocument();
    expect(dd.className).toMatch(/rose/);
  });

  it("exposes metric definitions via tooltip for accessibility", () => {
    render(
      <RiskStrip
        data={{ sharpe1y: 1, stddev1y: 12, maxDrawdown1y: -0.1 }}
      />,
    );
    expect(screen.getByText(/Excess return per unit of total risk/)).toBeInTheDocument();
    expect(screen.getByText(/Annualised standard deviation/)).toBeInTheDocument();
    expect(screen.getByText(/Largest peak-to-trough decline/)).toBeInTheDocument();
  });
});
