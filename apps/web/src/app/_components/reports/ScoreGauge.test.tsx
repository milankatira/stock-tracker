import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { makeVerdict } from "@finsight/shared";
import { ScoreGauge } from "./ScoreGauge";

describe("ScoreGauge", () => {
  it("renders the raw score value without rounding mutation", () => {
    render(<ScoreGauge score={7} verdict={makeVerdict("STRONG_SCORE")} />);
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("out of 10")).toBeInTheDocument();
  });

  it("uses emerald stroke for STRONG_SCORE", () => {
    const { container } = render(
      <ScoreGauge score={8} verdict={makeVerdict("STRONG_SCORE")} />,
    );
    const arc = container.querySelector("circle.stroke-emerald-500");
    expect(arc).not.toBeNull();
  });

  it("uses amber stroke for CAUTION", () => {
    const { container } = render(
      <ScoreGauge score={4} verdict={makeVerdict("CAUTION")} />,
    );
    const arc = container.querySelector("circle.stroke-amber-500");
    expect(arc).not.toBeNull();
  });

  it("uses rose stroke for WEAK_SCORE", () => {
    const { container } = render(
      <ScoreGauge score={2} verdict={makeVerdict("WEAK_SCORE")} />,
    );
    const arc = container.querySelector("circle.stroke-rose-500");
    expect(arc).not.toBeNull();
  });

  it("exposes an accessible label combining score + verdict", () => {
    render(<ScoreGauge score={7} verdict={makeVerdict("STRONG_SCORE")} />);
    expect(
      screen.getByRole("img", {
        name: /FinSight Score: 7 out of 10\. Verdict: Strong Score\./,
      }),
    ).toBeInTheDocument();
  });
});
