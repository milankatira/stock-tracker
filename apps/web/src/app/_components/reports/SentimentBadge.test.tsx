import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SentimentBadge } from "./SentimentBadge";

describe("SentimentBadge", () => {
  it("renders the label for each sentiment", () => {
    const { rerender } = render(<SentimentBadge sentiment="POSITIVE" />);
    expect(screen.getByText("Positive")).toBeInTheDocument();
    rerender(<SentimentBadge sentiment="NEGATIVE" />);
    expect(screen.getByText("Negative")).toBeInTheDocument();
    rerender(<SentimentBadge sentiment="NEUTRAL" />);
    expect(screen.getByText("Neutral")).toBeInTheDocument();
  });

  it("renders nothing for a null sentiment (no leaked text)", () => {
    const { container } = render(<SentimentBadge sentiment={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
