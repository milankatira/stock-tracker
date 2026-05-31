import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongooseModule, getModelToken } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Model } from "mongoose";
import { ensureMongo } from "../../../test/setup";
import { ChatSessionRepo } from "../chat-session.repo";
import {
  ChatSession,
  ChatSessionSchema,
  type ChatSessionDocument,
} from "../chat-session.schema";
import { RefusalCategory } from "../../ai/refusal/refusal.enum";

const USER_A = "user-a";
const USER_B = "user-b";

describe("ChatSessionRepo", () => {
  let moduleRef: TestingModule;
  let repo: ChatSessionRepo;
  let model: Model<ChatSessionDocument>;

  beforeAll(async () => {
    const uri = await ensureMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `chat-${randomUUID()}`, autoIndex: false }),
        MongooseModule.forFeature([{ name: ChatSession.name, schema: ChatSessionSchema }]),
      ],
      providers: [ChatSessionRepo],
    }).compile();
    repo = moduleRef.get(ChatSessionRepo);
    model = moduleRef.get<Model<ChatSessionDocument>>(getModelToken(ChatSession.name));
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
  });
  afterAll(async () => {
    await moduleRef?.close();
  });

  function create(userId = USER_A) {
    return repo.create({ userId, scope: { type: "stock", symbols: ["RELIANCE"] }, title: "Reliance chat" });
  }

  it("creates a session with empty messages and no soft-delete", async () => {
    const s = await create();
    expect(s.userId).toBe(USER_A);
    expect(s.messages).toEqual([]);
    expect(s.deletedAt).toBeNull();
  });

  it("listByUser excludes messages, sorts newest-first, and scopes by user", async () => {
    const a1 = await create();
    await repo.appendUser(String(a1._id), "m1", "hello");
    await create();
    await create(USER_B);

    const page = await repo.listByUser(USER_A, undefined, 20);
    expect(page.items).toHaveLength(2);
    expect(page.items.every((i) => i.userId === USER_A)).toBe(true);
    // messages projected out
    expect(page.items[0]!.messages).toBeUndefined();
    expect(page.nextCursor).toBeNull();
  });

  it("paginates with a cursor", async () => {
    for (let i = 0; i < 3; i += 1) await create();
    const first = await repo.listByUser(USER_A, undefined, 2);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await repo.listByUser(USER_A, first.nextCursor!, 2);
    expect(second.items).toHaveLength(1);
  });

  it("getById returns null for a cross-user session (no throw)", async () => {
    const s = await create(USER_A);
    expect(await repo.getById(String(s._id), USER_B)).toBeNull();
    expect(await repo.getById(String(s._id), USER_A)).not.toBeNull();
  });

  it("exists reflects ownership and soft-delete", async () => {
    const s = await create(USER_A);
    expect(await repo.exists(String(s._id), USER_A)).toBe(true);
    expect(await repo.exists(String(s._id), USER_B)).toBe(false);
    await model.updateOne({ _id: s._id }, { $set: { deletedAt: new Date() } });
    expect(await repo.exists(String(s._id), USER_A)).toBe(false);
  });

  it("loadHistory maps roles to Gemini shape and skips refusals/tools", async () => {
    const s = await create();
    const id = String(s._id);
    await repo.appendUser(id, "m1", "What is the score?");
    await repo.appendAssistant(id, "m1", "It is a Strong Score.", []);
    await repo.appendRefusal(id, "m2", RefusalCategory.OUT_OF_SCOPE_GEO);

    const history = await repo.loadHistory(id, 10);
    expect(history).toEqual([
      { role: "user", parts: [{ text: "What is the score?" }] },
      { role: "model", parts: [{ text: "It is a Strong Score." }] },
    ]);
  });

  it("findMessage returns the persisted assistant reply, not the user echo", async () => {
    const s = await create();
    const id = String(s._id);
    await repo.appendUser(id, "m1", "user text");
    await repo.appendAssistant(id, "m1", "assistant reply", [
      { sourceTag: "score:stock:RELIANCE", asOfDate: new Date("2026-05-28") },
    ]);

    const found = await repo.findMessage(id, "m1");
    expect(found?.role).toBe("assistant");
    expect(found?.content).toBe("assistant reply");
    expect(found?.citations).toHaveLength(1);
    expect(await repo.findMessage(id, "nope")).toBeNull();
  });

  it("getScope returns the session scope", async () => {
    const s = await create();
    expect(await repo.getScope(String(s._id))).toEqual({ type: "stock", symbols: ["RELIANCE"] });
  });
});
