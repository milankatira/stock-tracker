import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FundamentalsStrip } from "./FundamentalsStrip";

describe("FundamentalsStrip", () => {
  const data = {
    pe: 25.4,
    pb: 4.12,
    roe: 18.3,
    roce: 22.1,
    debtEquity: 0.43,
    marketCap: 1_500_000,
  };

  it("renders all six metric labels", () => {
    render(<FundamentalsStrip data={data} />);
    for (const label of ["P/E", "P/B", "ROE", "ROCE", "D/E", "Mkt Cap"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("formats P/E and P/B with the right decimal places", () => {
    render(<FundamentalsStrip data={data} />);
    expect(screen.getByText("25.4")).toBeInTheDocument();
    expect(screen.getByText("4.12")).toBeInTheDocument();
  });

  it("formats Market Cap with the Indian-convention abbreviation", () => {
    render(<FundamentalsStrip data={data} />);
    expect(screen.getByText("₹15.00L Cr")).toBeInTheDocument();
  });

  it("exposes the metric definition for accessibility (via tooltip)", () => {
    render(<FundamentalsStrip data={data} />);
    expect(
      screen.getByText(/Price to Earnings/),
    ).toBeInTheDocument();
  });
});
