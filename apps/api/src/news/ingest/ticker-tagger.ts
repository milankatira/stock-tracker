export interface InstrumentEntry {
  /** Canonical instrument id (Mongo ObjectId string). */
  readonly instrumentId: string;
  /** NSE ticker — used as the canonical symbol surface. */
  readonly symbol: string;
  /** Human-readable name. */
  readonly name: string;
  /**
   * Parent group token (e.g. `'ADANI'`, `'TATA'`). When ≥2 instruments
   * with the same `group` match a headline solely through a shared
   * brand alias, the tagger emits `groupLevel: <group>` instead of
   * per-instrument mentions so the score isn't over-attributed.
   */
  readonly group?: string;
  /**
   * Brand-only short tokens that on their own do NOT disambiguate
   * across the same `group` (e.g. `"Adani"` matches every Adani
   * instrument). Tag-time uses these to detect group ambiguity.
   */
  readonly groupAliases?: readonly string[];
}

export interface TaggerResult {
  readonly instrumentMentions: readonly string[];
  readonly groupLevel?: string;
  /** Plan 06-02 may wire an LLM disambiguation pass for these. */
  readonly needsLlmFallback: boolean;
}

/**
 * Word-boundary regex matcher over the instrument master.
 *
 * Algorithm:
 *   1. Build per-instrument matchers from `symbol` + `name`-first-token
 *      (≥3 chars) + any explicitly listed `groupAliases`.
 *   2. Match each instrument against the headline + description text.
 *   3. Separate matches into two buckets: SPECIFIC (matched via the
 *      symbol or the instrument's own name) vs GROUP (matched solely
 *      via a shared `groupAliases` token).
 *   4. If ≥2 instruments share a `group` and all matched as GROUP-only
 *      → emit `{ instrumentMentions: [], groupLevel: <group>, needsLlmFallback: true }`.
 *   5. Otherwise emit the set of SPECIFIC mentions.
 */
export function tagMentions(
  text: string,
  instruments: readonly InstrumentEntry[],
): TaggerResult {
  const haystack = text;
  const specific = new Set<string>();
  const groupHits = new Map<string, Set<string>>();

  // Pre-compute, per instrument, the first name-token that is NOT shared
  // with any sibling in the same `group`. That token is the
  // disambiguating own-pattern; the shared prefix tokens are demoted to
  // group aliases so the group-ambiguity branch fires on brand-only
  // mentions.
  const tokensByInstrument = new Map<string, ReadonlyArray<string>>();
  for (const inst of instruments) {
    tokensByInstrument.set(
      inst.instrumentId,
      (inst.name ?? "")
        .trim()
        .split(/\s+/)
        .filter((t) => t.length >= 3),
    );
  }
  const siblingsByGroup = new Map<string, InstrumentEntry[]>();
  for (const inst of instruments) {
    if (!inst.group) continue;
    const list = siblingsByGroup.get(inst.group) ?? [];
    list.push(inst);
    siblingsByGroup.set(inst.group, list);
  }
  function firstUnique(inst: InstrumentEntry): string | undefined {
    const tokens = tokensByInstrument.get(inst.instrumentId) ?? [];
    const siblings = inst.group ? siblingsByGroup.get(inst.group) ?? [] : [];
    const siblingTokens = new Set<string>();
    for (const s of siblings) {
      if (s.instrumentId === inst.instrumentId) continue;
      for (const t of tokensByInstrument.get(s.instrumentId) ?? []) {
        siblingTokens.add(t.toLowerCase());
      }
    }
    return tokens.find((t) => !siblingTokens.has(t.toLowerCase()));
  }

  for (const inst of instruments) {
    const symbol = inst.symbol.toUpperCase();
    const ownPatterns: RegExp[] = [];
    if (symbol.length >= 2) ownPatterns.push(wordRegex(symbol));
    const unique = firstUnique(inst);
    if (unique) ownPatterns.push(wordRegex(unique));

    const groupPatterns: RegExp[] = (inst.groupAliases ?? []).map((a) =>
      wordRegex(a),
    );
    // Tokens shared across siblings (e.g. "Adani") are group aliases.
    if (inst.group) {
      const siblings = siblingsByGroup.get(inst.group) ?? [];
      const sharedTokens = (tokensByInstrument.get(inst.instrumentId) ?? []).filter(
        (t) =>
          siblings.some(
            (s) =>
              s.instrumentId !== inst.instrumentId &&
              (tokensByInstrument.get(s.instrumentId) ?? []).some(
                (st) => st.toLowerCase() === t.toLowerCase(),
              ),
          ),
      );
      for (const shared of sharedTokens) groupPatterns.push(wordRegex(shared));
    }

    const ownMatch = ownPatterns.some((p) => p.test(haystack));
    const groupMatch = groupPatterns.some((p) => p.test(haystack));

    if (ownMatch) {
      specific.add(inst.instrumentId);
    } else if (groupMatch && inst.group) {
      const set = groupHits.get(inst.group) ?? new Set<string>();
      set.add(inst.instrumentId);
      groupHits.set(inst.group, set);
    }
  }

  // Group ambiguity: ≥2 instruments matched via group alias alone.
  const ambiguousGroup = [...groupHits.entries()].find(
    ([, ids]) => ids.size >= 2,
  );

  if (ambiguousGroup && specific.size === 0) {
    return {
      instrumentMentions: [],
      groupLevel: ambiguousGroup[0],
      needsLlmFallback: true,
    };
  }

  // If exactly one group hit and no SPECIFIC, treat the lone group-hit
  // as a SPECIFIC mention (single Adani sibling is unambiguous).
  if (!ambiguousGroup && specific.size === 0) {
    for (const ids of groupHits.values()) {
      if (ids.size === 1) {
        const [id] = ids;
        if (id) specific.add(id);
      }
    }
  }

  return {
    instrumentMentions: [...specific],
    needsLlmFallback: false,
  };
}

function wordRegex(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}
