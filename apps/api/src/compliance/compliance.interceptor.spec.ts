import { describe, expect, it } from "vitest";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import {
  ComplianceInterceptor,
  ComplianceViolationException,
  type AiOutputLike,
  type CompliantAiOutput,
} from "./compliance.interceptor";
import {
  ANALYSIS_DISCLAIMER,
  PAST_PERF_DISCLAIMER,
} from "./disclaimers.constants";
import {
  FORBIDDEN_FIXTURES,
  NEUTRAL_FIXTURES,
} from "./compliance.fixtures";

function makeContext(): ExecutionContext {
  return {} as ExecutionContext;
}

function makeHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

async function run(
  interceptor: ComplianceInterceptor,
  value: unknown,
): Promise<unknown> {
  return lastValueFrom(
    interceptor.intercept(makeContext(), makeHandler(value)),
  );
}

describe("ComplianceInterceptor", () => {
  it("returns a compliant payload with the analysis disclaimer for clean output", async () => {
    const interceptor = new ComplianceInterceptor();
    const aiOutput: AiOutputLike = {
      text: "The Strong Score reflects healthy fundamentals.",
      citedSources: ["scoreInput.score"],
    };

    const result = (await run(interceptor, aiOutput)) as CompliantAiOutput;

    expect(result.text).toBe(aiOutput.text);
    expect(result.citedSources).toEqual(["scoreInput.score"]);
    expect(result.disclaimers.analysis).toBe(ANALYSIS_DISCLAIMER);
    expect(result.disclaimers.pastPerformance).toBeUndefined();
  });

  it("attaches the past-performance disclaimer when touchesReturns is true", async () => {
    const interceptor = new ComplianceInterceptor();

    const result = (await run(interceptor, {
      text: "Three-year CAGR of 18% reflects category-leading performance.",
      citedSources: [],
      touchesReturns: true,
    })) as CompliantAiOutput;

    expect(result.disclaimers.pastPerformance).toBe(PAST_PERF_DISCLAIMER);
  });

  it("throws ComplianceViolationException for forbidden output", async () => {
    const interceptor = new ComplianceInterceptor();

    await expect(
      run(interceptor, { text: "We recommend holding the position." }),
    ).rejects.toBeInstanceOf(ComplianceViolationException);
  });

  it("ComplianceViolationException carries the forbidden labels", async () => {
    const interceptor = new ComplianceInterceptor();
    try {
      await run(interceptor, { text: "Target price of Rs. 3,200." });
      throw new Error("should not reach");
    } catch (err) {
      expect(err).toBeInstanceOf(ComplianceViolationException);
      const forbidden = (err as ComplianceViolationException).forbidden;
      expect(forbidden).toContain("phrase:target-price");
    }
  });

  it("does not transform values that are not AiOutput-shaped", async () => {
    const interceptor = new ComplianceInterceptor();
    await expect(run(interceptor, { ok: true })).resolves.toEqual({ ok: true });
    await expect(run(interceptor, 42)).resolves.toBe(42);
    await expect(run(interceptor, null)).resolves.toBeNull();
  });

  it("propagates errors from the underlying handler unchanged", async () => {
    const interceptor = new ComplianceInterceptor();
    const failing: CallHandler = {
      handle: () => throwError(() => new Error("loader exploded")),
    };
    await expect(
      lastValueFrom(interceptor.intercept(makeContext(), failing)),
    ).rejects.toThrow("loader exploded");
  });

  it("throws for every entry in FORBIDDEN_FIXTURES", async () => {
    const interceptor = new ComplianceInterceptor();
    for (const fixture of FORBIDDEN_FIXTURES) {
      await expect(run(interceptor, { text: fixture })).rejects.toBeInstanceOf(
        ComplianceViolationException,
      );
    }
  });

  it("passes every entry in NEUTRAL_FIXTURES", async () => {
    const interceptor = new ComplianceInterceptor();
    for (const fixture of NEUTRAL_FIXTURES) {
      const result = (await run(interceptor, {
        text: fixture,
      })) as CompliantAiOutput;
      expect(result.text).toBe(fixture);
      expect(result.disclaimers.analysis).toBe(ANALYSIS_DISCLAIMER);
    }
  });
});
