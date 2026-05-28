import type { Verdict } from "@finsight/shared";

interface ScoreGaugeProps {
  readonly score: number;
  readonly verdict: Verdict;
}

// Verdict is a branded string — brand erases at runtime, so a string-indexed
// record is the right contract. See VerdictBadge for the same pattern.
type VerdictValue = "STRONG_SCORE" | "CAUTION" | "WEAK_SCORE";

const COPY: Record<VerdictValue, string> = {
  STRONG_SCORE: "Strong Score",
  CAUTION: "Caution",
  WEAK_SCORE: "Weak Score",
};

const STROKE: Record<VerdictValue, string> = {
  STRONG_SCORE: "stroke-emerald-500",
  CAUTION: "stroke-amber-500",
  WEAK_SCORE: "stroke-rose-500",
};

export function ScoreGauge({ score, verdict }: ScoreGaugeProps) {
  const clamped = Math.max(0, Math.min(10, score));
  const pct = clamped / 10;
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 0.75;
  const fullArc = circumference * arcFraction;
  const offset = circumference * (1 - pct * arcFraction);
  const key = verdict as unknown as VerdictValue;

  return (
    <div
      className="relative h-44 w-44"
      role="img"
      aria-label={`FinSight Score: ${score} out of 10. Verdict: ${COPY[key]}.`}
    >
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-[135deg]">
        <circle
          cx="80"
          cy="80"
          r={radius}
          className="fill-none stroke-muted/40"
          strokeWidth="12"
          strokeDasharray={`${fullArc} ${circumference}`}
        />
        <circle
          cx="80"
          cy="80"
          r={radius}
          className={`fill-none ${STROKE[key]}`}
          strokeWidth="12"
          strokeDasharray={`${fullArc} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold tabular-nums">{score}</span>
        <span className="text-xs text-muted-foreground">out of 10</span>
      </div>
    </div>
  );
}
