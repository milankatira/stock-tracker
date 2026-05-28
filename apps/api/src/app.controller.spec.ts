import { describe, it, expect, beforeAll } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { SHARED_SENTINEL } from "@finsight/shared";
import { AppController } from "./app.controller";

describe("AppController", () => {
  let controller: AppController;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();
    controller = moduleRef.get<AppController>(AppController);
  });

  it("returns a typed ping response with the shared sentinel", () => {
    const res = controller.ping();
    expect(res.ok).toBe(true);
    expect(res.message).toBe("pong");
    expect(res.sharedSentinel).toBe(SHARED_SENTINEL);
    expect(res.sharedSentinel).toBe("@finsight/shared-v0");
  });
});
