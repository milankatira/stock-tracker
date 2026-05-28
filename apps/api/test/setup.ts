/**
 * Wave-0 test infrastructure.
 *
 * Boots two test-scoped singletons available to every spec:
 *   - `global.__MONGO__`     : MongoMemoryReplSet (single-node, replica-set
 *                              required for multi-document transactions and
 *                              time-series collections used in Plan 03+).
 *   - `global.__MONGO_URI__` : connection URI for the singleton.
 *   - `global.__REDIS_MOCK__`: ioredis-mock instance — same interface as
 *                              ioredis, no network. BullMQ Lua scripts NOT
 *                              supported; revisit when Phase 3 lands jobs.
 *
 * Specs that need Mongo / Redis pull these globals; specs that don't (e.g.
 * controller unit tests) pay no I/O cost — the singletons are created lazily
 * via `ensureMongo()` / `ensureRedis()`.
 *
 * Each spec is expected to use a UNIQUE database name (`finsight-${randomId}`)
 * to avoid cross-test bleed.
 */
import { beforeAll, afterAll } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import RedisMock from "ioredis-mock";

type RedisMockInstance = InstanceType<typeof RedisMock>;

declare global {
  // eslint-disable-next-line no-var
  var __MONGO__: MongoMemoryReplSet | undefined;
  // eslint-disable-next-line no-var
  var __MONGO_URI__: string | undefined;
  // eslint-disable-next-line no-var
  var __REDIS_MOCK__: RedisMockInstance | undefined;
}

/**
 * Lazily start the in-memory Mongo replica set. Specs call this when they
 * need a real Mongo connection.
 */
export async function ensureMongo(): Promise<string> {
  if (!globalThis.__MONGO__) {
    const repl = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    globalThis.__MONGO__ = repl;
    globalThis.__MONGO_URI__ = repl.getUri();
  }
  // Non-null assertion safe — we just assigned it above.
  return globalThis.__MONGO_URI__ as string;
}

/**
 * Lazily create the ioredis-mock client. Specs that need cache/session
 * primitives call this. Replace with a real Redis testcontainer when
 * BullMQ lands (Phase 3) — ioredis-mock doesn't run Lua scripts.
 */
export function ensureRedis(): RedisMockInstance {
  if (!globalThis.__REDIS_MOCK__) {
    globalThis.__REDIS_MOCK__ = new RedisMock();
  }
  return globalThis.__REDIS_MOCK__;
}

/**
 * Wave-0 hook — currently a no-op. Specs that need Mongo/Redis must call
 * `ensureMongo()` / `ensureRedis()` themselves so we don't pay the
 * mongodb-memory-server binary-download cost on every spec file (the
 * binary is ~100MB on first run and downloads lazily; pure unit specs
 * shouldn't trigger it).
 */
beforeAll(() => {
  // Reserved for future global init (e.g. seeding the env loader).
});

afterAll(async () => {
  if (globalThis.__MONGO__) {
    await globalThis.__MONGO__.stop();
    globalThis.__MONGO__ = undefined;
    globalThis.__MONGO_URI__ = undefined;
  }
  if (globalThis.__REDIS_MOCK__) {
    await globalThis.__REDIS_MOCK__.quit();
    globalThis.__REDIS_MOCK__ = undefined;
  }
});
