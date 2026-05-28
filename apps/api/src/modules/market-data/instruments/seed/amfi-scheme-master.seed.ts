import { Injectable, Logger } from "@nestjs/common";
import type { SchemeMaster } from "@finsight/shared";
import type { FundSeedInput } from "../funds.repository";

const DIRECT_RE = /\bdirect\b/i;
const IDCW_RE = /\b(idcw|dividend)\b/i;

/**
 * Adapts the AMFI `SchemeMaster[]` payload into `FundSeedInput[]`.
 *
 * The plan / option are derived from the scheme name because AMFI's
 * NAVAll.txt does not expose them as discrete fields. The AMC code is
 * the first word of the scheme name uppercased — good enough for the
 * v1 master; Phase 5 search will rely on the schema-level
 * `(amcCode, name, plan, option)` compound unique index to keep
 * duplicates out.
 */
@Injectable()
export class AmfiSchemeMasterSeed {
  private readonly logger = new Logger(AmfiSchemeMasterSeed.name);

  fromSchemeMasters(schemes: readonly SchemeMaster[]): readonly FundSeedInput[] {
    const seeds: FundSeedInput[] = [];
    let skipped = 0;
    for (const scheme of schemes) {
      const seed = this.toSeed(scheme);
      if (!seed) {
        skipped += 1;
        continue;
      }
      seeds.push(seed);
    }
    this.logger.log(
      { provider: "amfi", accepted: seeds.length, skipped },
      "amfi_scheme_master_parsed",
    );
    return seeds;
  }

  private toSeed(scheme: SchemeMaster): FundSeedInput | null {
    const name = scheme.schemeName.trim();
    if (name.length === 0 || scheme.schemeCode.length === 0) return null;
    const plan: "DIRECT" | "REGULAR" = DIRECT_RE.test(name)
      ? "DIRECT"
      : "REGULAR";
    const option: "GROWTH" | "IDCW" = IDCW_RE.test(name) ? "IDCW" : "GROWTH";
    const amcCode = this.amcCodeFromName(name);
    return {
      schemeCode: scheme.schemeCode,
      amcCode,
      name,
      plan,
      option,
      isin: scheme.isinGrowth ?? scheme.isinReinvestment ?? undefined,
    };
  }

  private amcCodeFromName(name: string): string {
    const firstToken = name.split(/[\s-]/, 1)[0] ?? name;
    return firstToken.toUpperCase().slice(0, 16);
  }
}
