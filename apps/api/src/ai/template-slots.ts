/**
 * Template-slot substitution. Replaces `{{placeholder}}` tokens with
 * verified string values. Unknown placeholders throw
 * `UnknownPlaceholderError` so the caller can reject the generation
 * cleanly (the narrative-batch processor in Plan 04-02 will retry).
 */

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export class UnknownPlaceholderError extends Error {
  constructor(public readonly placeholder: string) {
    super(`Unknown template placeholder: ${placeholder}`);
    this.name = "UnknownPlaceholderError";
  }
}

export function substituteSlots(
  paragraph: string,
  values: Record<string, string>,
): string {
  if (typeof paragraph !== "string" || paragraph.length === 0) {
    return paragraph ?? "";
  }
  return paragraph.replace(PLACEHOLDER_RE, (_match, raw: string) => {
    const key = raw.trim();
    const value = values[key];
    if (value === undefined) {
      throw new UnknownPlaceholderError(key);
    }
    return value;
  });
}
