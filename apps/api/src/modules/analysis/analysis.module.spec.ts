import { describe, expect, it } from "vitest";
import { AnalysisModule } from "./analysis.module";

describe("AnalysisModule", () => {
  it("is defined for AppModule imports", () => {
    expect(AnalysisModule).toBeDefined();
  });
});
