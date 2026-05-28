import { describe, expect, it } from "vitest";
import { MarketDataModule } from "./market-data.module";

describe("MarketDataModule", () => {
  it("is defined for future data-source wiring", () => {
    expect(MarketDataModule).toBeDefined();
  });
});
