import { describe, it, expect } from "vitest";
import { z } from "zod";
import { makeVerdict, isVerdict, VERDICTS, type Verdict } from "../src/verdict";

describe("makeVerdict", () => {
  it("returns a Verdict for STRONG_SCORE", () => {
    const v: Verdict = makeVerdict("STRONG_SCORE");
    expect(v).toBe("STRONG_SCORE");
  });

  it("returns a Verdict for CAUTION", () => {
    const v: Verdict = makeVerdict("CAUTION");
    expect(v).toBe("CAUTION");
  });

  it("returns a Verdict for WEAK_SCORE", () => {
    const v: Verdict = makeVerdict("WEAK_SCORE");
    expect(v).toBe("WEAK_SCORE");
  });

  it("throws at runtime when a non-allowed value is forced through (as any)", () => {
    // Defense-in-depth: even if the type system is bypassed via `as any`,
    // the runtime guard inside makeVerdict rejects unknown verdicts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => makeVerdict("not-a-verdict" as any)).toThrow(
      /Invalid verdict/,
    );
  });

  it("throws on empty string forced through (as any)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => makeVerdict("" as any)).toThrow(/Invalid verdict/);
  });
});

describe("isVerdict", () => {
  it.each(["STRONG_SCORE", "CAUTION", "WEAK_SCORE"])(
    "accepts %s",
    (v) => {
      expect(isVerdict(v)).toBe(true);
    },
  );

  it.each([
    "not-a-verdict",
    "weak",
    "strong",
    "",
    "strong_score", // case-sensitive
    "STRONG SCORE",
  ])("rejects string %p", (v) => {
    expect(isVerdict(v)).toBe(false);
  });

  it("rejects null", () => {
    expect(isVerdict(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isVerdict(undefined)).toBe(false);
  });

  it("rejects object", () => {
    expect(isVerdict({})).toBe(false);
    expect(isVerdict({ kind: "STRONG_SCORE" })).toBe(false);
  });

  it("rejects number", () => {
    expect(isVerdict(123)).toBe(false);
    expect(isVerdict(0)).toBe(false);
  });

  it("rejects boolean", () => {
    expect(isVerdict(true)).toBe(false);
    expect(isVerdict(false)).toBe(false);
  });

  it("rejects array", () => {
    expect(isVerdict([])).toBe(false);
    expect(isVerdict(["STRONG_SCORE"])).toBe(false);
  });
});

describe("VERDICTS", () => {
  it("exposes the three constants", () => {
    expect(VERDICTS.STRONG_SCORE).toBe("STRONG_SCORE");
    expect(VERDICTS.CAUTION).toBe("CAUTION");
    expect(VERDICTS.WEAK_SCORE).toBe("WEAK_SCORE");
  });

  it("VERDICTS values are === to the corresponding makeVerdict() result", () => {
    // Strings with identical content are reference-equal in JS due to interning,
    // so this also validates that makeVerdict returns the same primitive.
    expect(VERDICTS.STRONG_SCORE).toBe(makeVerdict("STRONG_SCORE"));
    expect(VERDICTS.CAUTION).toBe(makeVerdict("CAUTION"));
    expect(VERDICTS.WEAK_SCORE).toBe(makeVerdict("WEAK_SCORE"));
  });

  it("VERDICTS values pass the runtime guard", () => {
    expect(isVerdict(VERDICTS.STRONG_SCORE)).toBe(true);
    expect(isVerdict(VERDICTS.CAUTION)).toBe(true);
    expect(isVerdict(VERDICTS.WEAK_SCORE)).toBe(true);
  });
});

describe("Zod integration", () => {
  // Round-trip: Zod schemas built on isVerdict should accept allowed values
  // and reject anything else.
  const VerdictZ = z.string().refine(isVerdict, { message: "not a Verdict" });

  it("accepts each valid value", () => {
    expect(VerdictZ.parse("STRONG_SCORE")).toBe("STRONG_SCORE");
    expect(VerdictZ.parse("CAUTION")).toBe("CAUTION");
    expect(VerdictZ.parse("WEAK_SCORE")).toBe("WEAK_SCORE");
  });

  it("rejects an unknown verb", () => {
    expect(() => VerdictZ.parse("not-a-verdict")).toThrow();
  });

  it("rejects empty string", () => {
    expect(() => VerdictZ.parse("")).toThrow();
  });
});
