import { createHash } from "node:crypto";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
]);

/**
 * Strip known tracking params from a URL so the same article posted to
 * two campaigns hashes identically. Returns the input as-is when
 * parsing fails (defensive — adapters already filter malformed URLs).
 */
export function canonicalize(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    if (url.searchParams.toString().length === 0) {
      url.search = "";
    }
    if (url.hash) {
      url.hash = "";
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function hashContent(title: string, source: string): string {
  const seed = `${title.toLowerCase().trim()}|${source.toLowerCase().trim()}`;
  return createHash("sha256").update(seed).digest("hex");
}
