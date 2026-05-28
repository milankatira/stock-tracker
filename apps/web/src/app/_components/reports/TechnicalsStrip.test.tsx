import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TechnicalsStrip } from "./TechnicalsStrip";

describe("TechnicalsStrip", () => {
  it("renders RSI(14), MACD, 50/200 DMA, and Beta labels", () => {
    render(
      <TechnicalsStrip
        data={{
          rsi14: 55.3,
          macdSignal: "bullish",
          dma50: 2400.12,
          dma200: 2200.5,
          price: 2500,
          beta: 1.04,
        }}
      />,
    );
    for (const label of ["RSI(14)", "MACD", "50/200 DMA", "Beta"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("formats DMA as the labelled pair", () => {
    render(
      <TechnicalsStrip
        data={{
          rsi14: 55,
          macdSignal: "bullish",
          dma50: 2400.12,
          dma200: 2200.5,
          price: 2500,
          beta: 1,
        }}
      />,
    );
    expect(
      screen.getByText("50: ₹2400.12 / 200: ₹2200.50"),
    ).toBeInTheDocument();
  });

  it("renders MACD as an emerald badge when bullish", () => {
    render(
      <TechnicalsStrip
        data={{
          rsi14: 55,
          macdSignal: "bullish",
          dma50: 2400,
          dma200: 2200,
          price: 2500,
          beta: 1,
        }}
      />,
    );
    const badge = screen.getByText("bullish");
    expect(badge.className).toMatch(/emerald/);
  });

  it("renders MACD as a rose badge when bearish", () => {
    render(
      <TechnicalsStrip
        data={{
          rsi14: 55,
          macdSignal: "bearish",
          dma50: 2400,
          dma200: 2200,
          price: 2500,
          beta: 1,
        }}
      />,
    );
    expect(screen.getByText("bearish").className).toMatch(/rose/);
  });
});
