import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAmfiNavAll } from "./amfi.parser";

const fixtureBody = readFileSync(
  resolve(__dirname, "../../../test/fixtures/amfi-navall-sample.txt"),
  "utf8",
);

describe("parseAmfiNavAll", () => {
  it("accepts well-formed data rows and ignores banner / AMC / blank lines", () => {
    const { rows, rejected } = parseAmfiNavAll(fixtureBody);

    expect(rows.length).toBeGreaterThanOrEqual(9);
    expect(rows[0].schemeName).toContain("Frontline");
  });

  it("counts malformed data rows as rejected without throwing", () => {
    const { rejected } = parseAmfiNavAll(fixtureBody);

    expect(rejected).toBeGreaterThanOrEqual(1);
  });

  it("normalises ISIN placeholders ('-', empty, 'N.A.') to null", () => {
    const { rows } = parseAmfiNavAll(fixtureBody);
    const icici = rows.find((row) => row.schemeCode === "118989");

    expect(icici).toBeDefined();
    expect(icici?.isinReinvestment).toBeNull();
  });

  it("preserves the original DD-MMM-YYYY date string for downstream parsing", () => {
    const { rows } = parseAmfiNavAll(fixtureBody);
    expect(rows.every((row) => /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(row.date))).toBe(
      true,
    );
  });

  it("returns an empty result for an empty body without throwing", () => {
    expect(parseAmfiNavAll("")).toEqual({ rows: [], rejected: 0 });
  });

  it("is pure — calling twice on the same input yields the same output", () => {
    const first = parseAmfiNavAll(fixtureBody);
    const second = parseAmfiNavAll(fixtureBody);
    expect(second.rows).toHaveLength(first.rows.length);
    expect(second.rejected).toBe(first.rejected);
  });
});
