"use client";

import * as React from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { TIMEFRAMES, type OhlcCandle, type Timeframe } from "@finsight/shared";
import { cn } from "@/lib/cn";

const DEFAULT_TIMEFRAME: Timeframe = "1Y";
const DEBOUNCE_MS = 150;
const CHART_HEIGHT = 360;

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

interface PriceChartProps {
  readonly ticker: string;
  readonly initialTimeframe?: Timeframe;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function PriceChart({
  ticker,
  initialTimeframe = DEFAULT_TIMEFRAME,
}: PriceChartProps) {
  const [tf, setTf] = React.useState<Timeframe>(initialTimeframe);
  const debouncedTf = useDebouncedValue(tf, DEBOUNCE_MS);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height: CHART_HEIGHT,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "currentColor",
      },
      grid: {
        vertLines: { color: "rgba(120,120,120,0.12)" },
        horzLines: { color: "rgba(120,120,120,0.12)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      autoSize: false,
      width: containerRef.current.clientWidth,
    });
    const series = chart.addSeries(CandlestickSeries);
    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!seriesRef.current) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/reports/stock/${ticker}/prices?tf=${debouncedTf}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`Prices fetch failed: ${res.status}`);
        const candles = (await res.json()) as readonly OhlcCandle[];
        if (cancelled || !seriesRef.current) return;
        seriesRef.current.setData(
          candles.map((c) => ({
            time: c.time as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
      } catch (err) {
        if (!cancelled) {
          // Fail visibly during dev; production-grade error UX is a follow-up.
          console.error("PriceChart fetch failed", err);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [ticker, debouncedTf]);

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Chart timeframe" className="flex flex-wrap gap-1">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tf === t}
            onClick={() => setTf(t)}
            className={cn(
              "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
              tf === t
                ? "border-foreground/30 bg-foreground/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div
        ref={containerRef}
        aria-label={`${ticker} price chart, ${tf} timeframe`}
        className="w-full"
        style={{ height: CHART_HEIGHT }}
      />
    </div>
  );
}
