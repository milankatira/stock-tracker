/**
 * Mock for `passport-google-oauth20`.
 *
 * Plan 03 Task 3 uses this from the OAuth callback e2e spec — instead of
 * letting the real strategy redirect to accounts.google.com, we monkey-
 * patch `GoogleStrategy.prototype.authenticate` to invoke the configured
 * verify callback synchronously with a synthetic profile.
 *
 * Usage (inside an e2e spec):
 *
 *   import { mockGoogleStrategy, DEFAULT_GOOGLE_PROFILE } from '../test/google-oauth.mock';
 *
 *   beforeAll(() => mockGoogleStrategy(DEFAULT_GOOGLE_PROFILE));
 *
 *   it('signs up a new Google user on first callback', async () => {
 *     const res = await request(app.getHttpServer()).get('/auth/google/callback');
 *     expect(res.status).toBe(302);
 *   });
 */
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

export interface MockGoogleProfile {
  readonly id: string;
  readonly emails: ReadonlyArray<{ value: string; verified: boolean }>;
  readonly displayName: string;
  readonly provider?: string;
}

export const DEFAULT_GOOGLE_PROFILE: MockGoogleProfile = {
  id: "google-user-1",
  emails: [{ value: "gtest@example.com", verified: true }],
  displayName: "Google Test User",
  provider: "google",
};

interface PassportStrategyInternals {
  _verify: (
    accessToken: string,
    refreshToken: string,
    profile: MockGoogleProfile,
    done: (err: unknown, user?: unknown) => void,
  ) => void;
  success: (user: unknown) => void;
  error: (err: unknown) => void;
}

/**
 * Patches `GoogleStrategy.prototype.authenticate` so a synthetic profile
 * flows straight through the strategy's verify callback. Idempotent —
 * calling twice replaces the patch with the latest profile.
 *
 * Returns a `restore()` function that re-installs the original
 * `authenticate` so subsequent specs aren't affected.
 */
export function mockGoogleStrategy(
  profile: MockGoogleProfile = DEFAULT_GOOGLE_PROFILE,
): () => void {
  const proto = GoogleStrategy.prototype as unknown as {
    authenticate: (this: GoogleStrategy) => void;
  };
  const original = proto.authenticate;

  proto.authenticate = function patchedAuthenticate(
    this: GoogleStrategy,
  ): void {
    const internals = this as unknown as PassportStrategyInternals;
    internals._verify(
      "mock-access-token",
      "mock-refresh-token",
      profile,
      (err: unknown, user?: unknown) => {
        if (err) {
          internals.error(err);
          return;
        }
        internals.success(user);
      },
    );
  };

  return function restore(): void {
    proto.authenticate = original;
  };
}
