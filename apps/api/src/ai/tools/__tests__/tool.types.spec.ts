import { describe, expect, it } from "vitest";
import {
  ALL_TOOLS,
  TOOL_REGISTRY,
  TOOL_REGISTRY_TOKEN,
} from "../tools.registry";
import { ToolError } from "../tool.types";
import { makeCtx } from "./_fixtures";

describe("TOOL_REGISTRY", () => {
  it("exposes exactly the 7 named tools", () => {
    expect(Object.keys(ALL_TOOLS).sort()).toEqual(
      [
        "comparePeers",
        "getFundReturns",
        "getInstrumentFundamentals",
        "getInstrumentScore",
        "getInstrumentTechnicals",
        "getRecentNews",
        "searchInstruments",
      ].sort(),
    );
    expect(TOOL_REGISTRY.declarations).toHaveLength(7);
  });

  it("every declaration has a unique name and a READ-ONLY description", () => {
    const names = TOOL_REGISTRY.declarations.map((d) => d.name);
    expect(new Set(names).size).toBe(7);
    for (const d of TOOL_REGISTRY.declarations) {
      expect(d.description).toMatch(/READ-ONLY/);
    }
  });

  it("execute() dispatches to the named tool", async () => {
    const res = await TOOL_REGISTRY.execute(
      { name: "getInstrumentScore", args: { symbolOrSchemeCode: "RELIANCE", type: "stock" } },
      makeCtx(),
    );
    expect(res.sourceTag).toBe("score:stock:RELIANCE");
  });

  it("execute() throws UNKNOWN_TOOL for an unregistered name", async () => {
    await expect(
      TOOL_REGISTRY.execute({ name: "deleteEverything", args: {} }, makeCtx()),
    ).rejects.toMatchObject({ code: "UNKNOWN_TOOL" });
  });

  it("ToolError carries its code and name", () => {
    const e = new ToolError("NO_SCORE_YET", "pending");
    expect(e.code).toBe("NO_SCORE_YET");
    expect(e.name).toBe("ToolError");
    expect(e).toBeInstanceOf(Error);
  });

  it("exports the DI token", () => {
    expect(TOOL_REGISTRY_TOKEN).toBe("TOOL_REGISTRY");
  });
});
