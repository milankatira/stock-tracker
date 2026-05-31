import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CitationPill } from "../citation-pill";

describe("CitationPill", () => {
  it("renders a human label + date for a score sourceTag", () => {
    render(
      <CitationPill citation={{ sourceTag: "score:stock:RELIANCE", asOfDate: "2026-05-28T00:00:00.000Z" }} />,
    );
    expect(screen.getByText(/FinSight Score · RELIANCE/)).toBeInTheDocument();
    expect(screen.getByText(/28 May/)).toBeInTheDocument();
  });

  it("exposes the full sourceTag + asOfDate via the title attribute", () => {
    const { container } = render(
      <CitationPill citation={{ sourceTag: "news:RELIANCE:7d", asOfDate: "2026-05-28T00:00:00.000Z" }} />,
    );
    const el = container.querySelector("[title]");
    expect(el?.getAttribute("title")).toContain("news:RELIANCE:7d");
  });
});
