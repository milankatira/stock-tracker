/**
 * Ambient type declaration for `ioredis-mock`.
 *
 * The package ships a CommonJS entry without discoverable TypeScript types in
 * the app build. We only need the default constructor shape; runtime usage is
 * limited to test-mode Redis replacement in CacheModule.
 */
declare module "ioredis-mock" {
  import { Redis } from "ioredis";

  const RedisMock: new (...args: ConstructorParameters<typeof Redis>) => Redis;
  export default RedisMock;
}
