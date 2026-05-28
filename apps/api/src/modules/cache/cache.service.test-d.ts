import { expectTypeOf } from "vitest";
import { CacheService } from "./cache.service";

const service = {} as CacheService;

expectTypeOf(service.set).parameter(2).toEqualTypeOf<number>();

// @ts-expect-error ttlSeconds is required by FOUND-05.
service.set("k", "v");

// @ts-expect-error ttlSeconds must be a number.
service.set("k", "v", "60");
