import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PeerCard } from "./PeerCard";

describe("PeerCard", () => {
  const peers = [
    { ticker: "ONGC", name: "Oil & Natural Gas Corp", score: 8 },
    { ticker: "IOC", name: "Indian Oil Corporation", score: 5 },
    { ticker: "BPCL", name: "Bharat Petroleum", score: 3 },
  ] as const;

  it("renders three peer rows with name + ticker + score", () => {
    render(<PeerCard peers={peers} />);
    expect(screen.getByText("Oil & Natural Gas Corp")).toBeInTheDocument();
    expect(screen.getByText("Indian Oil Corporation")).toBeInTheDocument();
    expect(screen.getByText("Bharat Petroleum")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("links each peer to the authed /app/stock/<ticker> report", () => {
    render(<PeerCard peers={peers} />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/app/stock/ONGC");
    expect(links[1]).toHaveAttribute("href", "/app/stock/IOC");
    expect(links[2]).toHaveAttribute("href", "/app/stock/BPCL");
  });

  it("applies emerald tone for high scores and rose for low scores", () => {
    render(<PeerCard peers={peers} />);
    expect(screen.getByText("8.0").className).toMatch(/emerald/);
    expect(screen.getByText("5.0").className).toMatch(/amber/);
    expect(screen.getByText("3.0").className).toMatch(/rose/);
  });

  it("renders an empty state when peers is empty", () => {
    render(<PeerCard peers={[]} />);
    expect(screen.getByText(/No peers available yet/)).toBeInTheDocument();
  });
});
