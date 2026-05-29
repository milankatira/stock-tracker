import { describe, expect, it, vi } from "vitest";
import type { Connection } from "mongoose";
import { assertNewsVectorIndex } from "./vector-index.assert";

function makeConn(result: unknown[]): Connection {
  return {
    collection: () => ({
      aggregate: () => ({
        toArray: () => Promise.resolve(result),
      }),
    }),
  } as unknown as Connection;
}

describe("assertNewsVectorIndex", () => {
  it("is a no-op when the env flag is unset (local mongo / memory-server)", async () => {
    const conn = makeConn([]);
    await expect(assertNewsVectorIndex(conn)).resolves.toBeUndefined();
  });

  it("throws when the index is missing", async () => {
    const conn = makeConn([]);
    await expect(
      assertNewsVectorIndex(conn, { enabled: true }),
    ).rejects.toThrow(/not found on 'news'/);
  });

  it("throws when numDimensions does not equal 768", async () => {
    const conn = makeConn([
      {
        name: "news_embedding_idx",
        latestDefinition: {
          fields: [
            { type: "vector", path: "embedding", numDimensions: 1024 },
          ],
        },
      },
    ]);
    await expect(
      assertNewsVectorIndex(conn, { enabled: true }),
    ).rejects.toThrow(/expected 768, found 1024/);
  });

  it("resolves cleanly on a correctly-shaped index", async () => {
    const conn = makeConn([
      {
        name: "news_embedding_idx",
        status: "READY",
        queryable: true,
        latestDefinition: {
          fields: [
            { type: "vector", path: "embedding", numDimensions: 768 },
            { type: "filter", path: "instrumentMentions" },
          ],
        },
      },
    ]);
    await expect(
      assertNewsVectorIndex(conn, { enabled: true }),
    ).resolves.toBeUndefined();
  });

  it("wraps connection errors with the news-index context", async () => {
    const conn = {
      collection: () => ({
        aggregate: () => ({
          toArray: () => Promise.reject(new Error("no perms")),
        }),
      }),
    } as unknown as Connection;
    await expect(
      assertNewsVectorIndex(conn, { enabled: true }),
    ).rejects.toThrow(/Could not enumerate Atlas Search indexes/);
  });
});
