"use client";

import * as React from "react";
import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { FundReturns } from "@finsight/shared";

const CHART_HEIGHT = 320;
const BUCKET_TIMES: Record<keyof FundReturns["fund"], number> = {
  "1y": 1_700_000_000,
  "3y": 1_710_000_000,
  "5y": 1_720_000_000,
  "10y": 1_730_000_000,
};

interface ReturnsChartProps {
  readonly returns: FundReturns;
}

function bucketsToSeries(bucket: FundReturns["fund"]) {
  return (Object.keys(BUCKET_TIMES) as Array<keyof FundReturns["fund"]>).map(
    (k) => ({ time: BUCKET_TIMES[k] as Time, value: bucket[k] }),
  );
}

export function ReturnsChart({ returns }: ReturnsChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const fundRef = React.useRef<ISeriesApi<"Line"> | null>(null);
  const benchRef = React.useRef<ISeriesApi<"Line"> | null>(null);
  const catRef = React.useRef<ISeriesApi<"Line"> | null>(null);

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
    const fund = chart.addSeries(LineSeries, { color: "#10b981" });
    const bench = chart.addSeries(LineSeries, { color: "#3b82f6" });
    const cat = chart.addSeries(LineSeries, { color: "#a855f7" });
    chartRef.current = chart;
    fundRef.current = fund;
    benchRef.current = bench;
    catRef.current = cat;

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
      fundRef.current = null;
      benchRef.current = null;
      catRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    fundRef.current?.setData(bucketsToSeries(returns.fund));
    benchRef.current?.setData(bucketsToSeries(returns.benchmark));
    catRef.current?.setData(bucketsToSeries(returns.category));
  }, [returns]);

  return (
    <section aria-label="Returns chart" className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-emerald-500" /> Fund
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-blue-500" /> Benchmark
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-purple-500" /> Category
        </span>
      </div>
      <div
        ref={containerRef}
        className="w-full"
        style={{ height: CHART_HEIGHT }}
      />
    </section>
  );
}
