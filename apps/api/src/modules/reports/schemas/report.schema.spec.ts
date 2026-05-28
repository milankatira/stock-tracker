import { describe, expect, it } from "vitest";
import {
  REPORT_ASSET_TYPES,
  REPORT_STATUSES,
  Report,
  ReportSchema,
} from "./report.schema";

describe("Report schema", () => {
  it("declares the expected status enum", () => {
    expect([...REPORT_STATUSES]).toEqual(["queued", "running", "completed", "failed"]);
  });

  it("declares the expected asset type enum", () => {
    expect([...REPORT_ASSET_TYPES]).toEqual(["stock"]);
  });

  it("registers an owner-scoped index sorted by createdAt desc", () => {
    const indexes = ReportSchema.indexes();
    const ownerCreatedAt = indexes.find(
      ([fields]) => fields.ownerUserId === 1 && fields.createdAt === -1 && fields._id === -1,
    );

    expect(ownerCreatedAt).toBeDefined();
  });

  it("registers an owner+symbol index for filtered history", () => {
    const indexes = ReportSchema.indexes();
    const ownerSymbol = indexes.find(
      ([fields]) => fields.ownerUserId === 1 && fields["asset.symbol"] === 1,
    );

    expect(ownerSymbol).toBeDefined();
  });

  it("registers an owner+requestHash index for idempotency lookups", () => {
    const indexes = ReportSchema.indexes();
    const ownerHash = indexes.find(
      ([fields]) =>
        fields.ownerUserId === 1 && fields["generation.requestHash"] === 1,
    );

    expect(ownerHash).toBeDefined();
  });

  it("binds the Report class name to the schema metadata", () => {
    expect(Report.name).toBe("Report");
  });
});
