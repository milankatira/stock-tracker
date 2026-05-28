import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongooseModule, getModelToken } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Model } from "mongoose";
import { ensureMongo } from "../../../test/setup";
import { makeReportSeed } from "../../../test/factories/report.factory";
import { ReportsRepository } from "./reports.repository";
import { Report, ReportSchema, type ReportDocument } from "./schemas/report.schema";

describe("ReportsRepository", () => {
  let moduleRef: TestingModule;
  let repository: ReportsRepository;
  let reportModel: Model<ReportDocument>;

  beforeAll(async () => {
    const uri = await ensureMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, {
          dbName: `reports-${randomUUID()}`,
          autoIndex: false,
        }),
        MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
      ],
      providers: [ReportsRepository],
    }).compile();

    repository = moduleRef.get(ReportsRepository);
    reportModel = moduleRef.get<Model<ReportDocument>>(getModelToken(Report.name));
  }, 60_000);

  afterEach(async () => {
    await reportModel.deleteMany({});
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  async function seedReport(
    overrides: Parameters<typeof makeReportSeed>[0] = {},
    createdAt?: Date,
  ): Promise<{ id: string; ownerUserId: string }> {
    const saved = await repository.create(makeReportSeed(overrides));
    if (createdAt) {
      await reportModel.updateOne(
        { _id: saved.id },
        { $set: { createdAt, updatedAt: createdAt } },
      );
    }
    return { id: saved.id, ownerUserId: saved.id ? overrides.ownerUserId ?? "" : "" };
  }

  it("persists a report with serialised dates and string ID", async () => {
    const seed = makeReportSeed({ ownerUserId: "owner-1" });

    const created = await repository.create(seed);

    expect(created.id).toMatch(/^[a-f0-9]{24}$/);
    expect(created.status).toBe("completed");
    expect(created.asset).toEqual(seed.asset);
    expect(created.generation.requestHash).toBe(seed.generation.requestHash);
    expect(typeof created.createdAt).toBe("string");
    expect(typeof created.generation.requestedAt).toBe("string");
  });

  it("scopes detail lookups to the owner", async () => {
    const ownerOne = await repository.create(makeReportSeed({ ownerUserId: "owner-1" }));
    const ownerTwo = await repository.create(makeReportSeed({ ownerUserId: "owner-2" }));

    await expect(repository.findByOwnerAndId("owner-1", ownerOne.id)).resolves.toMatchObject({
      id: ownerOne.id,
    });
    await expect(repository.findByOwnerAndId("owner-1", ownerTwo.id)).resolves.toBeNull();
    await expect(repository.findByOwnerAndId("owner-1", "not-a-valid-id")).resolves.toBeNull();
  });

  it("returns reports newest first for an owner", async () => {
    const ownerUserId = "owner-sort";
    const baseTime = new Date("2026-05-20T00:00:00.000Z").getTime();
    const a = await repository.create(makeReportSeed({ ownerUserId }));
    const b = await repository.create(makeReportSeed({ ownerUserId }));
    const c = await repository.create(makeReportSeed({ ownerUserId }));

    await reportModel.updateOne(
      { _id: a.id },
      { $set: { createdAt: new Date(baseTime), updatedAt: new Date(baseTime) } },
    );
    await reportModel.updateOne(
      { _id: b.id },
      {
        $set: {
          createdAt: new Date(baseTime + 1000),
          updatedAt: new Date(baseTime + 1000),
        },
      },
    );
    await reportModel.updateOne(
      { _id: c.id },
      {
        $set: {
          createdAt: new Date(baseTime + 2000),
          updatedAt: new Date(baseTime + 2000),
        },
      },
    );

    const result = await repository.listByOwner(ownerUserId);

    expect(result.items.map((item) => item.id)).toEqual([c.id, b.id, a.id]);
    expect(result.nextCursor).toBeNull();
  });

  it("filters by normalized asset symbol", async () => {
    const ownerUserId = "owner-symbol";
    const relianceSeed = makeReportSeed({
      ownerUserId,
      asset: { name: "Reliance Industries", type: "stock", symbol: "RELIANCE.NS" },
    });
    const tcsSeed = makeReportSeed({
      ownerUserId,
      asset: { name: "Tata Consultancy Services", type: "stock", symbol: "TCS.NS" },
    });
    await repository.create(relianceSeed);
    await repository.create(tcsSeed);

    const onlyReliance = await repository.listByOwner(ownerUserId, {
      symbol: "RELIANCE.NS",
    });

    expect(onlyReliance.items).toHaveLength(1);
    expect(onlyReliance.items[0]?.asset.symbol).toBe("RELIANCE.NS");
  });

  it("paginates with an opaque cursor that yields stable next pages", async () => {
    const ownerUserId = "owner-paginate";
    const baseTime = new Date("2026-05-21T00:00:00.000Z").getTime();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const saved = await repository.create(makeReportSeed({ ownerUserId }));
      ids.push(saved.id);
      await reportModel.updateOne(
        { _id: saved.id },
        {
          $set: {
            createdAt: new Date(baseTime + i * 1000),
            updatedAt: new Date(baseTime + i * 1000),
          },
        },
      );
    }

    const firstPage = await repository.listByOwner(ownerUserId, { limit: 2 });
    expect(firstPage.items.map((item) => item.id)).toEqual([ids[4], ids[3]]);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await repository.listByOwner(ownerUserId, {
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items.map((item) => item.id)).toEqual([ids[2], ids[1]]);
    expect(secondPage.nextCursor).not.toBeNull();

    const thirdPage = await repository.listByOwner(ownerUserId, {
      limit: 2,
      cursor: secondPage.nextCursor ?? undefined,
    });
    expect(thirdPage.items.map((item) => item.id)).toEqual([ids[0]]);
    expect(thirdPage.nextCursor).toBeNull();
  });

  it("clamps oversized limit requests to the 50-item ceiling", async () => {
    const ownerUserId = "owner-limit";
    const seed = makeReportSeed({ ownerUserId });
    await repository.create(seed);

    const result = await repository.listByOwner(ownerUserId, { limit: 999 });

    expect(result.items).toHaveLength(1);
  });

  it("returns an empty page for owners with no reports", async () => {
    const result = await repository.listByOwner("owner-empty");
    expect(result).toEqual({ items: [], nextCursor: null });
  });
});
