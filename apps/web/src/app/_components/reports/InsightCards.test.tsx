import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { makeVerdict, type StockReportDoc } from "@finsight/shared";
import { InsightCards } from "./InsightCards";

const doc: StockReportDoc = {
  ticker: "RELIANCE",
  name: "Reliance Industries",
  sector: "Energy",
  asOf: "2026-05-27T12:30:00.000Z",
  dataVersionHash: "v1",
  score: {
    value: 7,
    verdict: makeVerdict("STRONG_SCORE"),
    pillars: {
      fundamentals: 8,
      valuation: 6,
      technical: 7,
      sentiment: 5,
      risk: 6,
      event: 7,
    },
    weightsVersion: "0.1.0",
  },
  fundamentals: { pe: 25, pb: 4, roe: 18, roce: 22, debtEquity: 0.4, marketCap: 1_500_000 },
  technicals: { rsi14: 55, macdSignal: "bullish", dma50: 2400, dma200: 2200, price: 2500, beta: 1 },
  insights: {
    volatility: { stddev1y: 22.4 },
    profitConsistency: { profitableQuartersPct: 80, window: "12Q" },
    eventSensitivity: { avgAbsReturnOnResultDay: 1.8, baseline: 1 },
    swot: {
      strengths: ["Dominant retail footprint"],
      weaknesses: ["High capex cycle"],
      opportunities: ["5G expansion"],
      threats: ["Crude price shocks"],
      citedSources: ["q4-filing"],
    },
    promoterHoldings: { latestPct: 50.32, deltaPctVsPrevQ: 0.45 },
  },
  peers: [],
  narrative: null,
  disclaimers: { analysis: "Analysis." },
  dataLineage: [],
};

describe("InsightCards", () => {
  it("renders exactly six insight cards with the correct titles", () => {
    render(<InsightCards doc={doc} />);
    const titles = ["Score Breakdown", "Volatility", "Profit Consistency", "Event Sensitivity", "SWOT", "Promoter Holdings"];
    for (const t of titles) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("Score Breakdown lists all six pillar labels", () => {
    render(<InsightCards doc={doc} />);
    for (const label of ["Fundamentals", "Valuation", "Technical", "Sentiment", "Risk", "Event"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("Volatility renders stddev with % suffix and one decimal", () => {
    render(<InsightCards doc={doc} />);
    expect(screen.getByText("22.4%")).toBeInTheDocument();
  });

  it("Profit Consistency shows the percent + window pill", () => {
    render(<InsightCards doc={doc} />);
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("12Q window")).toBeInTheDocument();
  });

  it("Event Sensitivity shows delta vs baseline above zero", () => {
    render(<InsightCards doc={doc} />);
    expect(screen.getByText("1.8%")).toBeInTheDocument();
    expect(screen.getByText(/\+0\.8%/)).toBeInTheDocument();
  });

  it("SWOT renders four quadrants with bullets", () => {
    render(<InsightCards doc={doc} />);
    expect(screen.getByText("Strengths")).toBeInTheDocument();
    expect(screen.getByText("Weaknesses")).toBeInTheDocument();
    expect(screen.getByText("Opportunities")).toBeInTheDocument();
    expect(screen.getByText("Threats")).toBeInTheDocument();
    expect(screen.getByText("Dominant retail footprint")).toBeInTheDocument();
  });

  it("Promoter Holdings shows latest percent + delta arrow with sign", () => {
    render(<InsightCards doc={doc} />);
    expect(screen.getByText("50.32%")).toBeInTheDocument();
    const card = screen.getByText("Promoter Holdings").closest("div")!;
    const within$ = within(card.parentElement!.parentElement!);
    expect(within$.getByText(/\+0\.45% vs previous quarter/)).toBeInTheDocument();
  });
});
