import { describe, expect, it } from "vitest";
import {
  downsideCaptureRatio,
  downsideStdDev,
  meanReturn,
  quartileStability,
  sharpeRatio,
  sortinoRatio,
  stdDev,
} from "../returns-math";

function constant(length: number, value: number): number[] {
  return Array.from({ length }, () => value);
}

function alternating(length: number, a: number, b: number): number[] {
  return Array.from({ length }, (_, i) => (i % 2 === 0 ? a : b));
}

describe("meanReturn", () => {
  it("returns 0 for an empty input", () => {
    expect(meanReturn([]).toFixed(4)).toBe("0.0000");
  });

  it("computes the arithmetic mean", () => {
    expect(meanReturn([0.01, 0.02, 0.03]).toFixed(4)).toBe("0.0200");
  });
});

describe("stdDev", () => {
  it("returns 0 when the input has fewer than 2 entries", () => {
    expect(stdDev([]).toFixed(4)).toBe("0.0000");
    expect(stdDev([0.01]).toFixed(4)).toBe("0.0000");
  });

  it("returns 0 for a constant series", () => {
    expect(stdDev(constant(10, 0.02)).toFixed(4)).toBe("0.0000");
  });

  it("computes the sample stddev (n-1 denominator) for an alternating series", () => {
    expect(stdDev(alternating(10, 0.04, -0.02)).toFixed(4)).toBe("0.0316");
  });
});

describe("downsideStdDev", () => {
  it("returns 0 when there are no entries below the threshold", () => {
    expect(downsideStdDev(constant(10, 0.02)).toFixed(4)).toBe("0.0000");
  });

  it("considers only the entries below the threshold", () => {
    const result = downsideStdDev([0.05, -0.01, 0.03, -0.04, 0.02]);
    expect(Number(result.toFixed(4))).toBeGreaterThan(0);
  });
});

describe("sharpeRatio", () => {
  it("returns null when the input has fewer than 12 months", () => {
    expect(sharpeRatio([0.01], [0])).toBeNull();
    expect(sharpeRatio(constant(11, 0.02), constant(11, 0.005))).toBeNull();
  });

  it("returns null on mismatched lengths", () => {
    expect(sharpeRatio(constant(12, 0.02), constant(11, 0.005))).toBeNull();
  });

  it("returns null when the excess-return stddev is zero", () => {
    expect(sharpeRatio(constant(12, 0.02), constant(12, 0.005))).toBeNull();
  });

  it("annualises a positive excess return into a positive Sharpe", () => {
    const fund = alternating(12, 0.04, 0.02);
    const rf = constant(12, 0.005);
    const result = sharpeRatio(fund, rf);
    expect(result).not.toBeNull();
    expect(result!.toNumber()).toBeGreaterThan(0);
  });
});

describe("sortinoRatio", () => {
  it("returns null when there are no negative excess returns (no downside)", () => {
    const fund = constant(12, 0.05);
    const rf = constant(12, 0.005);
    expect(sortinoRatio(fund, rf)).toBeNull();
  });

  it("annualises into a positive Sortino when downside stddev is positive", () => {
    const fund = [0.06, -0.02, 0.04, -0.03, 0.05, -0.04, 0.07, -0.01, 0.03, -0.02, 0.04, -0.03];
    const rf = constant(12, 0.005);
    const result = sortinoRatio(fund, rf);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.toNumber())).toBe(true);
  });
});

describe("downsideCaptureRatio", () => {
  it("returns null when no benchmark months are negative", () => {
    const fund = constant(12, 0.02);
    const bench = constant(12, 0.01);
    expect(downsideCaptureRatio(fund, bench)).toBeNull();
  });

  it("captures less than 100% when fund falls less than benchmark on down months", () => {
    const bench = [-0.05, 0.02, -0.04, 0.01];
    const fund = [-0.03, 0.02, -0.02, 0.01];
    const result = downsideCaptureRatio(fund, bench);
    expect(result).not.toBeNull();
    expect(result!.toNumber()).toBeLessThan(100);
  });
});

describe("quartileStability", () => {
  it("returns 5 for an empty window list", () => {
    expect(quartileStability([]).toFixed(4)).toBe("5.0000");
  });

  it("returns 10 when every window finished top-two", () => {
    expect(quartileStability([true, true, true]).toFixed(4)).toBe("10.0000");
  });

  it("returns 0 when no window finished top-two", () => {
    expect(quartileStability([false, false, false]).toFixed(4)).toBe("0.0000");
  });

  it("returns 5 for a half-half record", () => {
    expect(quartileStability([true, false, true, false]).toFixed(4)).toBe("5.0000");
  });
});
