import { cn } from "@/lib/cn";

const DIVISIONS: ReadonlyArray<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2 hours ago", "3 days ago", "just now" (< 60s). Server-renderable. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  let delta = (then - now) / 1000; // seconds, negative for past
  if (Math.abs(delta) < 60) return "just now";
  for (const division of DIVISIONS) {
    if (Math.abs(delta) < division.amount) {
      return rtf.format(Math.round(delta), division.unit);
    }
    delta /= division.amount;
  }
  return "";
}

interface RelativeTimeProps {
  readonly iso: string;
  readonly className?: string;
}

/**
 * Accessible relative timestamp — renders a semantic `<time>` element
 * with the machine-readable `dateTime` for SEO + screen readers and a
 * human "2 hours ago" label.
 */
export function RelativeTime({ iso, className }: RelativeTimeProps) {
  return (
    <time dateTime={iso} className={cn("text-xs text-muted-foreground", className)}>
      {formatRelative(iso)}
    </time>
  );
}
