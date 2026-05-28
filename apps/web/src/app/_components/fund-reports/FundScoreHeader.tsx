import type { FundReportDoc } from "@finsight/shared";
import { ScoreGauge } from "../reports/ScoreGauge";
import { VerdictBadge } from "../reports/VerdictBadge";

interface FundScoreHeaderProps {
  readonly doc: FundReportDoc;
}

export function FundScoreHeader({ doc }: FundScoreHeaderProps) {
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <ScoreGauge score={doc.score.value} verdict={doc.score.verdict} />
      <div className="flex-1 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {doc.name}{" "}
          <span className="text-xl text-muted-foreground">
            ({doc.schemeCode})
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {doc.category} · as of {new Date(doc.asOf).toLocaleDateString("en-IN")}
        </p>
        <div className="pt-1">
          <VerdictBadge verdict={doc.score.verdict} />
        </div>
      </div>
    </header>
  );
}
