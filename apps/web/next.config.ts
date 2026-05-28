import type { NextConfig } from "next";

const config: NextConfig = {
  // The shared workspace package ships pre-built ESM+CJS via tsup, but
  // listing it here makes Next compile its source directly during dev,
  // which means changes in `packages/shared/src` show up in `apps/web`
  // without re-running `pnpm --filter @finsight/shared build`.
  transpilePackages: ["@finsight/shared"],
};

export default config;
