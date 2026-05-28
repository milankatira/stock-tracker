import { expectTypeOf } from "expect-type";
import { makeVerdict, type Verdict, VERDICTS } from "../src/verdict";

// Valid literals are accepted by makeVerdict's parameter
expectTypeOf(makeVerdict).parameter(0).toEqualTypeOf<
  "STRONG_SCORE" | "CAUTION" | "WEAK_SCORE"
>();

// makeVerdict returns the branded Verdict type
expectTypeOf(makeVerdict).returns.toEqualTypeOf<Verdict>();

// Plain string literals cannot satisfy Verdict (the brand symbol is missing)
{
  // @ts-expect-error — plain string literal not assignable to branded Verdict
  const v1: Verdict = "STRONG_SCORE";
  void v1;
}

// Disallowed literals are rejected at the constructor boundary
{
  // @ts-expect-error — literal not in VerdictLiteral union
  const v2: Verdict = makeVerdict("not-a-verdict");
  void v2;
}

{
  // @ts-expect-error — empty string not in VerdictLiteral union
  const v3: Verdict = makeVerdict("");
  void v3;
}

// VERDICTS values are Verdict-typed
expectTypeOf(VERDICTS.STRONG_SCORE).toEqualTypeOf<Verdict>();
expectTypeOf(VERDICTS.CAUTION).toEqualTypeOf<Verdict>();
expectTypeOf(VERDICTS.WEAK_SCORE).toEqualTypeOf<Verdict>();

// VERDICTS is the only safe surface for callers — confirm shape
expectTypeOf(VERDICTS).toEqualTypeOf<{
  readonly STRONG_SCORE: Verdict;
  readonly CAUTION: Verdict;
  readonly WEAK_SCORE: Verdict;
}>();
