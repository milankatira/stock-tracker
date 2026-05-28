import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NarrativeBlock } from "./NarrativeBlock";

describe("NarrativeBlock", () => {
  it("renders narrative paragraph as plain text (never dangerouslySetInnerHTML)", () => {
    const html = "<script>alert(1)</script>safe";
    render(
      <NarrativeBlock
        narrative={{
          paragraph: html,
          citedSources: ["fundamentals.roe", "technicals.rsi14"],
          generatedAt: new Date().toISOString(),
          auditPassed: true,
        }}
      />,
    );
    expect(screen.getByText(html)).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("renders cited sources caption", () => {
    render(
      <NarrativeBlock
        narrative={{
          paragraph: "Solid fundamentals across the board.",
          citedSources: ["fundamentals.roe", "technicals.rsi14"],
          generatedAt: new Date().toISOString(),
          auditPassed: true,
        }}
      />,
    );
    expect(
      screen.getByText(/fundamentals\.roe, technicals\.rsi14/),
    ).toBeInTheDocument();
  });

  it("renders 'generated <timeAgo>' microcopy", () => {
    render(
      <NarrativeBlock
        narrative={{
          paragraph: "Solid fundamentals.",
          citedSources: ["score"],
          generatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          auditPassed: true,
        }}
      />,
    );
    expect(screen.getByText(/Generated 5m ago/)).toBeInTheDocument();
  });

  it("shows the placeholder when narrative is null", () => {
    render(<NarrativeBlock narrative={null} />);
    expect(
      screen.getByText(/Narrative being generated\. Refresh shortly\./),
    ).toBeInTheDocument();
  });
});
