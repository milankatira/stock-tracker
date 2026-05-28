import type { Verdict } from "@finsight/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

// Verdict is a branded string. Brand erases at runtime, so a `string`-indexed
// lookup is type-safe AND keeps the JSX clean. Exhaustiveness is enforced via
// the COPY/TONE definitions sharing the literal set.
type VerdictValue = "STRONG_SCORE" | "CAUTION" | "WEAK_SCORE";

const COPY: Record<VerdictValue, string> = {
  STRONG_SCORE: "Strong Score",
  CAUTION: "Caution",
  WEAK_SCORE: "Weak Score",
};

const TONE: Record<VerdictValue, string> = {
  STRONG_SCORE: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  CAUTION: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  WEAK_SCORE: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

interface VerdictBadgeProps {
  readonly verdict: Verdict;
  readonly className?: string;
}

export function VerdictBadge({ verdict, className }: VerdictBadgeProps) {
  const key = verdict as unknown as VerdictValue;
  return (
    <Badge
      variant="outline"
      className={cn(TONE[key], "px-2.5 py-0.5", className)}
    >
      {COPY[key]}
    </Badge>
  );
}
