import { describe, expect, it } from "vitest";
import { ReportsModule } from "./reports.module";

describe("ReportsModule", () => {
  it("exports a Nest module class for AppModule wiring", () => {
    expect(ReportsModule).toBeDefined();
  });
});
