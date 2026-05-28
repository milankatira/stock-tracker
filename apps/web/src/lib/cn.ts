import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn` — the shadcn-style class-name composer.
 *
 * Combines `clsx` (conditional class lists) with `tailwind-merge`
 * (intelligent resolution of conflicting Tailwind utilities — `p-2` +
 * `p-4` resolves to `p-4`). Used by every UI primitive in
 * `apps/web/src/components/ui/`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
