import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { MongooseModule } from "@nestjs/mongoose";
import { getModelToken } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { ensureMongo } from "../../../test/setup";
import { makeUserSeed } from "../../../test/factories/user.factory";
import { User } from "./schemas/user.schema";
import { UsersModule } from "./users.module";
import { UsersRepository } from "./users.repository";

describe("UsersRepository", () => {
  let moduleRef: TestingModule;
  let repository: UsersRepository;
  let userModel: Model<User>;

  beforeAll(async () => {
    const uri = await ensureMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, {
          dbName: `users-${randomUUID()}`,
          autoIndex: false,
        }),
        UsersModule,
      ],
    }).compile();

    repository = moduleRef.get(UsersRepository);
    userModel = moduleRef.get(getModelToken(User.name));
  }, 60_000);

  afterEach(async () => {
    await userModel.deleteMany({});
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it("creates a user with normalized email and timestamps", async () => {
    const seed = makeUserSeed({ email: "UPPER@Test.Local" });

    const created = await repository.create(seed);

    expect(created.email).toBe("upper@test.local");
    expect(created.name).toBe(seed.name);
    expect(created.provider).toBe("local");
    expect(created.emailVerified).toBe(false);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });

  it("finds a user by case-insensitive email", async () => {
    const created = await repository.create(
      makeUserSeed({ email: "lookup@test.local" }),
    );

    await expect(repository.findByEmail("LOOKUP@Test.Local")).resolves.toMatchObject({
      _id: created._id,
      email: "lookup@test.local",
    });
  });

  it("upserts Google users by provider identity", async () => {
    const first = await repository.upsertGoogleUser({
      email: "google@test.local",
      name: "Google User",
      providerId: "google-1",
      emailVerified: true,
    });

    const second = await repository.upsertGoogleUser({
      email: "google-renamed@test.local",
      name: "Renamed",
      providerId: "google-1",
      emailVerified: true,
    });

    expect(second._id).toEqual(first._id);
    expect(second.email).toBe("google-renamed@test.local");
    expect(second.name).toBe("Renamed");
    await expect(repository.findByProvider("google", "google-1")).resolves.toMatchObject({
      _id: first._id,
      email: "google-renamed@test.local",
    });
  });
});
