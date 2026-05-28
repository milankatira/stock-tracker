/**
 * Wave-0 smoke test — proves the test infra itself boots cleanly.
 *
 * - mongodb-memory-server starts a single-node replica set and accepts a
 *   real Mongo connection from a fresh `mongoose.connect`.
 * - ioredis-mock implements the surface area we'll use in Plan 02
 *   (SET/GET/EXPIRE/DEL/PING).
 * - The Google OAuth mock module is importable without booting the
 *   strategy (verified by the import resolving without throwing).
 *
 * If any of these break, every downstream plan's auth + cache tests
 * will break with them — fail loud and fail here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import {
  ensureMongo,
  ensureRedis,
} from "./setup";
import {
  DEFAULT_GOOGLE_PROFILE,
  mockGoogleStrategy,
} from "./google-oauth.mock";
import { makeUserSeed } from "./factories/user.factory";

describe("Wave-0 infra", () => {
  describe("mongodb-memory-server", () => {
    let conn: typeof mongoose;

    beforeAll(async () => {
      const uri = await ensureMongo();
      conn = await mongoose.connect(uri, { dbName: "wave0-smoke" });
    }, 60_000);

    afterAll(async () => {
      if (conn) await conn.disconnect();
    });

    it("connects to the in-memory replica set", async () => {
      expect(mongoose.connection.readyState).toBe(1); // 1 = connected
    });

    it("can insert and read back a document (replica-set txn capable)", async () => {
      const Schema = new mongoose.Schema({ name: String, n: Number });
      const Model = mongoose.model("Wave0Doc", Schema);
      const doc = await Model.create({ name: "hello", n: 42 });
      const found = await Model.findById(doc._id).lean();
      expect(found).not.toBeNull();
      expect(found?.name).toBe("hello");
      expect(found?.n).toBe(42);
    });
  });

  describe("ioredis-mock", () => {
    it("exposes a Redis-like client with SET/GET/EXPIRE/DEL/PING", async () => {
      const redis = ensureRedis();
      const pong = await redis.ping();
      expect(pong).toBe("PONG");

      await redis.set("k", "v", "EX", 60);
      expect(await redis.get("k")).toBe("v");

      const ttl = await redis.ttl("k");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);

      const deleted = await redis.del("k");
      expect(deleted).toBe(1);
      expect(await redis.get("k")).toBeNull();
    });
  });

  describe("google-oauth mock", () => {
    it("exposes a default profile + a patcher that returns a restore fn", () => {
      expect(DEFAULT_GOOGLE_PROFILE.id).toBe("google-user-1");
      expect(DEFAULT_GOOGLE_PROFILE.emails[0]?.value).toBe(
        "gtest@example.com",
      );
      // Don't actually patch — just prove the function is callable.
      // Patching requires a registered strategy instance, which Plan 03
      // adds. Here we only check the export surface.
      expect(typeof mockGoogleStrategy).toBe("function");
    });
  });

  describe("user factory", () => {
    it("produces unique emails on repeated calls", () => {
      const a = makeUserSeed();
      const b = makeUserSeed();
      expect(a.email).not.toBe(b.email);
      expect(a.provider).toBe("local");
      expect(a.emailVerified).toBe(false);
    });

    it("respects overrides", () => {
      const seed = makeUserSeed({
        email: "override@test.local",
        provider: "google",
        providerId: "g-1",
        emailVerified: true,
      });
      expect(seed.email).toBe("override@test.local");
      expect(seed.provider).toBe("google");
      expect(seed.providerId).toBe("g-1");
      expect(seed.emailVerified).toBe(true);
    });
  });
});
