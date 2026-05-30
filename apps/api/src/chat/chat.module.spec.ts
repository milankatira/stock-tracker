import { describe, expect, it } from "vitest";
import { ChatModule } from "./chat.module";

describe("ChatModule", () => {
  it("exports a Nest module class for AppModule wiring", () => {
    expect(ChatModule).toBeDefined();
  });
});
