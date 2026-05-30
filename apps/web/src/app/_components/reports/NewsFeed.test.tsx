import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { NewsFeedItem } from "@finsight/shared";
import { NewsFeed } from "./NewsFeed";

function makeItems(count: number): NewsFeedItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    title: `Headline number ${i}`,
    url: `https://example.com/article-${i}`,
    source: "moneycontrol",
    publishedAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
    sentiment: i % 3 === 0 ? "POSITIVE" : null,
  }));
}

describe("NewsFeed", () => {
  it("renders all items as text", () => {
    render(<NewsFeed items={makeItems(10)} />);
    expect(screen.getByText("Headline number 0")).toBeInTheDocument();
    expect(screen.getByText("Headline number 9")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("renders every external link with target=_blank and rel=noopener noreferrer", () => {
    render(<NewsFeed items={makeItems(5)} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("renders a sentiment badge only for classified items (none for null)", () => {
    // item 0 → POSITIVE, items 1 & 2 → null
    render(<NewsFeed items={makeItems(3)} />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("Positive")).toBeInTheDocument();
    expect(within(rows[1]!).queryByText(/Positive|Negative|Neutral/)).toBeNull();
    expect(within(rows[2]!).queryByText(/Positive|Negative|Neutral/)).toBeNull();
  });

  it("shows an empty state when there are no items", () => {
    render(<NewsFeed items={[]} />);
    expect(screen.getByText(/No recent news for this stock/)).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("renders the analysis-not-advice disclaimer", () => {
    render(<NewsFeed items={makeItems(2)} />);
    expect(
      screen.getByText(/Sentiment tags are AI analysis, not investment advice/),
    ).toBeInTheDocument();
  });
});
