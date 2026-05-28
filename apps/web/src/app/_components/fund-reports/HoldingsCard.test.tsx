import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HoldingsCard } from "./HoldingsCard";

describe("HoldingsCard", () => {
  const sample = Array.from({ length: 12 }, (_, i) => ({
    name: `Holding ${i + 1}`,
    weightPct: 12 - i * 0.5,
  }));

  it("renders up to 10 rows sorted by weight descending", () => {
    render(<HoldingsCard holdings={sample} />);
    expect(screen.getAllByRole("row")).toHaveLength(11); // header + 10 rows
    expect(screen.getByText("Holding 1")).toBeInTheDocument();
    expect(screen.queryByText("Holding 11")).toBeNull();
  });

  it("formats weights with one decimal + percent suffix", () => {
    render(<HoldingsCard holdings={sample} />);
    expect(screen.getByText("12.0%")).toBeInTheDocument();
    expect(screen.getByText("11.5%")).toBeInTheDocument();
  });

  it("renders empty state when holdings is empty", () => {
    render(<HoldingsCard holdings={[]} />);
    expect(screen.getByText("Holdings not available")).toBeInTheDocument();
  });
});
