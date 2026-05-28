import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { MongooseModule, getConnectionToken } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import { Connection, Types } from "mongoose";
import { ensureMongo } from "../../../test/setup";
import { ScoreHistoryBootstrap } from "./score-history.bootstrap";
import { ScoreHistoryRepository } from "./score-history.repository";
import { ScoreHistory, ScoreHistorySchema } from "./score-history.schema";

describe("ScoreHistoryBootstrap + ScoreHistoryRepository", () => {
  let moduleRef: TestingModule;
  let repo: ScoreHistoryRepository;
  let bootstrap: ScoreHistoryBootstrap;
  let conn: Connection;

  beforeAll(async () => {
    const uri = await ensureMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, {
          dbName: `score-history-${randomUUID()}`,
          autoIndex: false,
        }),
        MongooseModule.forFeature([
          { name: ScoreHistory.name, schema: ScoreHistorySchema },
        ]),
      ],
      providers: [ScoreHistoryRepository, ScoreHistoryBootstrap],
    }).compile();

    repo = moduleRef.get(ScoreHistoryRepository);
    bootstrap = moduleRef.get(ScoreHistoryBootstrap);
    conn = moduleRef.get<Connection>(getConnectionToken());
    await bootstrap.ensure();
  }, 60_000);

  afterEach(async () => {
    if (conn.db) {
      await conn.db.collection("score_history").deleteMany({});
    }
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  function makeInput(
    instrumentId: Types.ObjectId,
    asOfDate: string,
    score: number,
    computedAt: Date,
  ) {
    return {
      instrumentId,
      instrumentType: "STOCK" as const,
      asOfDate,
      computedAt,
      score,
      verdict: "CAUTION" as const,
      pillars: [],
      scoringEngineVersion: "0.1.0",
    };
  }

  it("creates a time-series collection (verified via listCollections)", async () => {
    if (!conn.db) throw new Error("no connection");
    const result = (await conn.db
      .listCollections({ name: "score_history" })
      .toArray()) as Array<{
      name: string;
      type?: string;
      options?: { timeseries?: { timeField?: string } };
    }>;

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("timeseries");
    expect(result[0]?.options?.timeseries?.timeField).toBe("computedAt");
  });

  it("ensure() is idempotent — second call does not throw NamespaceExists", async () => {
    await expect(bootstrap.ensure()).resolves.not.toThrow();
    await expect(bootstrap.ensure()).resolves.not.toThrow();
  });

  it("findLatest returns the freshest document by computedAt", async () => {
    const instrumentId = new Types.ObjectId();
    const base = new Date("2026-05-26T12:30:00.000Z").getTime();

    await repo.insert(makeInput(instrumentId, "2026-05-26", 6.5, new Date(base)));
    await repo.insert(
      makeInput(instrumentId, "2026-05-27", 7.0, new Date(base + 24 * 60 * 60 * 1000)),
    );
    await repo.insert(
      makeInput(instrumentId, "2026-05-28", 7.5, new Date(base + 48 * 60 * 60 * 1000)),
    );

    const latest = await repo.findLatest(instrumentId);
    expect(latest?.asOfDate).toBe("2026-05-28");
    expect(latest?.score).toBe(7.5);
  });

  it("findRange returns documents in ascending computedAt order", async () => {
    const instrumentId = new Types.ObjectId();
    const start = new Date("2026-05-20T00:00:00.000Z");
    const oneDay = 24 * 60 * 60 * 1000;
    for (let i = 0; i < 5; i += 1) {
      await repo.insert(
        makeInput(
          instrumentId,
          `2026-05-${20 + i}`,
          5 + i * 0.5,
          new Date(start.getTime() + i * oneDay),
        ),
      );
    }

    const range = await repo.findRange(
      instrumentId,
      new Date("2026-05-21T00:00:00.000Z"),
      new Date("2026-05-24T23:59:59.000Z"),
    );

    expect(range.map((doc) => doc.asOfDate)).toEqual([
      "2026-05-21",
      "2026-05-22",
      "2026-05-23",
      "2026-05-24",
    ]);
  });

  it("findLatest returns null when no documents exist for the instrument", async () => {
    const result = await repo.findLatest(new Types.ObjectId());
    expect(result).toBeNull();
  });
});
