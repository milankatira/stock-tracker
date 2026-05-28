/**
 * Ambient type declarations for `ioredis-mock`.
 *
 * The package ships a CJS file with no TypeScript types. We don't need a
 * full typing — `ioredis-mock` is API-compatible with `ioredis`, so we
 * re-export the default constructor as `typeof Redis`.
 */
declare module "ioredis-mock" {
  import { Redis } from "ioredis";
  const RedisMock: new (...args: ConstructorParameters<typeof Redis>) => Redis;
  export default RedisMock;
}
