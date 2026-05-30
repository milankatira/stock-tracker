import { applyReplacements, containsForbidden } from "./forbidden-verbs";

const ABBREVIATIONS = new Set<string>([
  "vs", "etc", "ie", "eg", "mr", "mrs", "ms", "dr", "no", "fig",
  "approx", "q1", "q2", "q3", "q4", "inc", "ltd", "co", "jan", "feb",
  "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
]);

type State = "OUT" | "IN_NUMBER" | "IN_ABBREV";

const TERMINATORS = new Set([".", "!", "?"]);

/**
 * Streaming sentence boundary detector + compliance sanitiser (CHAT-03).
 *
 * Gemini emits text token-by-token; emitting raw tokens to the client
 * would leak a half-formed "you should b…" before the sanitiser could
 * act. The buffer accumulates tokens and only emits at a *sentence*
 * boundary, after running the forbidden-verb sanitiser — so the smallest
 * unit the client ever sees is a fully-formed, compliance-checked sentence.
 *
 * Boundary decision is deferred by one character: when a terminator
 * (`.`/`!`/`?`) arrives we wait for the next char to disambiguate:
 *   - digit `.` digit            → decimal  → state IN_NUMBER, no split (`7.2%`)
 *   - <abbrev>`.`                → abbrev   → state IN_ABBREV, no split (`vs.`)
 *   - terminator + whitespace    → sentence boundary → emit
 *   - terminator + other         → treated as intra-token, no split (`U.S`)
 * A terminator at end-of-chunk is held until the next `feed()` (or `flush()`),
 * so boundaries are detected correctly across streamed chunks.
 */
export class SentenceBuffer {
  private buf = "";
  private fullTextAcc = "";
  private state: State = "OUT";
  private awaiting: "." | "!" | "?" | null = null;
  /** True if any sentence emitted since construction contained a forbidden verb. */
  sawForbidden = false;

  feed(chunk: string): string[] {
    this.fullTextAcc += chunk;
    const out: string[] = [];
    for (const ch of chunk) {
      if (this.awaiting) {
        // resolveAwaiting fully consumes `ch` in every branch (it either
        // emits a sentence and drops the whitespace, or appends `ch` to the
        // buffer as part of a decimal / abbrev / glued token).
        const resolved = this.resolveAwaiting(ch);
        if (resolved !== null) out.push(resolved);
        continue;
      }
      if (TERMINATORS.has(ch)) {
        this.buf += ch;
        this.awaiting = ch as "." | "!" | "?";
        continue;
      }
      this.buf += ch;
      this.state = /[0-9]/.test(ch) ? "IN_NUMBER" : "OUT";
    }
    return out;
  }

  /** Emit any buffered remainder (e.g. a final sentence with no trailing space). */
  flush(): string[] {
    this.awaiting = null;
    const trimmed = this.buf.trim();
    this.buf = "";
    this.state = "OUT";
    if (trimmed.length === 0) return [];
    return [this.emit(trimmed)];
  }

  /** Full raw (un-sanitised) accumulated text — Plan 03 citation validator. */
  fullText(): string {
    return this.fullTextAcc;
  }

  /**
   * Resolve a pending terminator against the next char.
   * Returns the emitted (sanitised) sentence on a boundary, else `null`
   * (the char should be appended normally by the caller).
   */
  private resolveAwaiting(nextCh: string): string | null {
    const term = this.awaiting;
    this.awaiting = null;
    const prevCh = this.buf.length >= 2 ? this.buf[this.buf.length - 2] : "";

    if (term === ".") {
      // Decimal / grouped number: digit . digit → not a boundary.
      if (/[0-9]/.test(prevCh ?? "") && /[0-9]/.test(nextCh)) {
        this.state = "IN_NUMBER";
        this.buf += nextCh;
        return null;
      }
      // Abbreviation: trailing letters before the dot are a known abbrev.
      const m = /([A-Za-z]+)\.$/.exec(this.buf);
      if (m && ABBREVIATIONS.has(m[1]!.toLowerCase())) {
        this.state = "IN_ABBREV";
        this.buf += nextCh;
        return null;
      }
    }

    if (/\s/.test(nextCh)) {
      // Sentence boundary — emit buffer, consume the whitespace.
      const sentence = this.buf.trim();
      this.buf = "";
      this.state = "OUT";
      return this.emit(sentence);
    }

    // Terminator glued to a non-space char (e.g. "U.S") — not a boundary.
    this.buf += nextCh;
    this.state = "OUT";
    return null;
  }

  private emit(rawSentence: string): string {
    if (containsForbidden(rawSentence)) {
      this.sawForbidden = true;
      // NOTE: in the live chat stream, `AiService.chatStream` hard-refuses
      // (onRefusal + return) the moment `sawForbidden` flips, so this
      // softened replacement output is NOT emitted to the client there.
      // The replacement path exists for non-stream reuse and is exercised
      // by the unit tests; do not assume softened sentences reach the SSE
      // client. Refuse-over-soften is the deliberate SEBI-safe choice.
      return applyReplacements(rawSentence);
    }
    return rawSentence;
  }
}
