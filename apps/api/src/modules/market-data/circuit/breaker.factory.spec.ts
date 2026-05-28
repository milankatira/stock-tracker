import { describe, expect, it, vi } from "vitest";
import { CircuitBreakerFactory } from "./breaker.factory";

describe("CircuitBreakerFactory", () => {
  it("returns the same breaker for repeated calls with the same name", () => {
    const factory = new CircuitBreakerFactory();
    const fn = async (x: number) => x * 2;

    const a = factory.forAction({ name: "yahoo.quote" }, fn);
    const b = factory.forAction({ name: "yahoo.quote" }, fn);

    expect(a).toBe(b);
  });

  it("keeps independent state for different action names", () => {
    const factory = new CircuitBreakerFactory();
    const quote = factory.forAction({ name: "yahoo.quote" }, async () => 1);
    const history = factory.forAction(
      { name: "yahoo.history" },
      async () => 2,
    );

    expect(quote).not.toBe(history);
    expect(factory.list().map((b) => b.name).sort()).toEqual([
      "yahoo.history",
      "yahoo.quote",
    ]);
  });

  it("reports its current state via list()", () => {
    const factory = new CircuitBreakerFactory();
    factory.forAction({ name: "nse.quote" }, async () => 1);

    const list = factory.list();
    expect(list).toEqual([{ name: "nse.quote", state: "closed" }]);
  });

  it("opens the circuit after enough failures and rejects subsequent calls fast", async () => {
    const factory = new CircuitBreakerFactory();
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    const breaker = factory.forAction(
      {
        name: "test.fail-fast",
        errorThresholdPercentage: 1,
        resetTimeoutMs: 60_000,
        timeoutMs: 100,
      },
      failing,
    );

    for (let i = 0; i < 5; i += 1) {
      await expect(breaker.fire()).rejects.toThrow();
    }
    await expect(breaker.fire()).rejects.toThrow();
    const list = factory.list();
    expect(list[0]?.state).toBe("open");
  });
});
