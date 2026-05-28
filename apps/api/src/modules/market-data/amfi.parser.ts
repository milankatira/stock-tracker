import { amfiNavRowShape, type AmfiNavRow } from "./amfi.schemas";

export interface ParseAmfiResult {
  readonly rows: readonly AmfiNavRow[];
  readonly rejected: number;
}

const FIELD_COUNT = 6;

/**
 * Pure parser for AMFI's NAVAll.txt. The file mixes:
 *   - section banners ("Open Ended Schemes(Equity Scheme - Large Cap...)")
 *   - AMC name lines (single token, no ';')
 *   - blank lines
 *   - data rows: `code;isinGrowth;isinReinv;schemeName;nav;date`
 *
 * Returns accepted rows + the count of malformed data rows so the caller
 * can log them. The function NEVER throws on a single bad row — the only
 * gate is the adapter-level "row count ≥ 8000" sanity check.
 */
export function parseAmfiNavAll(body: string): ParseAmfiResult {
  if (typeof body !== "string" || body.length === 0) {
    return { rows: [], rejected: 0 };
  }

  const rows: AmfiNavRow[] = [];
  let rejected = 0;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const fields = line.split(";");
    if (fields.length < FIELD_COUNT) continue; // banner / AMC name / heading

    const [schemeCode, isinGrowth, isinReinvestment, schemeName, navText, date] =
      fields.map((field) => field.trim());

    // Skip the literal header row published every day.
    if (schemeCode.toLowerCase() === "scheme code") continue;

    const parsed = amfiNavRowShape.safeParse({
      schemeCode,
      isinGrowth: normaliseIsin(isinGrowth),
      isinReinvestment: normaliseIsin(isinReinvestment),
      schemeName,
      nav: Number(navText),
      date,
    });

    if (parsed.success) {
      rows.push(parsed.data);
    } else {
      rejected += 1;
    }
  }

  return { rows, rejected };
}

function normaliseIsin(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "-" || trimmed === "N.A.") {
    return null;
  }
  return trimmed;
}
