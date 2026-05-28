import { describe, expect, it } from "vitest";
import { AuthModule } from "./auth.module";

describe("AuthModule", () => {
  it("exports a Nest module class for AppModule wiring", () => {
    expect(AuthModule).toBeDefined();
  });
});
