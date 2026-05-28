/**
 * Test factory for User documents.
 *
 * Returns a plain object shaped like the User schema Plan 03 will define.
 * Use `makeUserSeed({ email: '...' })` in tests to get deterministic data
 * without hand-rolling fields. The factory generates a unique email per
 * call so parallel tests don't collide on the unique index.
 */
export type UserProvider = "local" | "google";

export interface UserSeed {
  email: string;
  name: string;
  passwordHash?: string;
  provider: UserProvider;
  providerId?: string;
  emailVerified: boolean;
}

let userCounter = 0;

function uniqueEmail(): string {
  userCounter += 1;
  const suffix = Math.random().toString(36).slice(2, 8);
  return `user-${userCounter}-${suffix}@test.local`;
}

export function makeUserSeed(overrides: Partial<UserSeed> = {}): UserSeed {
  return {
    email: uniqueEmail(),
    name: "Test User",
    provider: "local",
    emailVerified: false,
    ...overrides,
  };
}
