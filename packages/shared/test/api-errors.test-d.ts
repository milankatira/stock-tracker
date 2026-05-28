import { expectTypeOf } from "expect-type";
import type { ApiError } from "../src/index";

// Type-level test: ApiError is exactly the discriminated union we expect.
// Each branch is asserted individually so a missing/extra branch fails loudly.
{
  type ExpectedKinds =
    | "validation"
    | "unauthorized"
    | "forbidden"
    | "not_found"
    | "conflict"
    | "rate_limited"
    | "server_error";

  expectTypeOf<ApiError["kind"]>().toEqualTypeOf<ExpectedKinds>();
  expectTypeOf<ApiError["message"]>().toEqualTypeOf<string>();
}

// validation variant may carry `details: unknown`
{
  type Validation = Extract<ApiError, { kind: "validation" }>;
  expectTypeOf<Validation>().toEqualTypeOf<{
    kind: "validation";
    message: string;
    details?: unknown;
  }>();
}

// rate_limited variant may carry `retryAfterSec: number`
{
  type RateLimited = Extract<ApiError, { kind: "rate_limited" }>;
  expectTypeOf<RateLimited>().toEqualTypeOf<{
    kind: "rate_limited";
    message: string;
    retryAfterSec?: number;
  }>();
}
