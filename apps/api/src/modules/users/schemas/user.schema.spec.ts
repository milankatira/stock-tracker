import { describe, expect, it } from "vitest";
import { UserProviderValues, UserSchema } from "./user.schema";

describe("UserSchema", () => {
  it("documents unique lookup indexes used by auth flows", () => {
    expect(UserSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ email: 1 }, { unique: true }],
        [
          { provider: 1, providerId: 1 },
          {
            unique: true,
            partialFilterExpression: { providerId: { $type: "string" } },
          },
        ],
      ]),
    );
  });

  it("timestamps users and restricts auth provider values", () => {
    expect(UserSchema.get("timestamps")).toBe(true);
    expect(UserProviderValues).toEqual(["local", "google"]);
  });
});
