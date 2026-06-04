import Link from "next/link";
import type { ComparisonVerdict, PendingScoreResponse } from "@finsight/shared";
import { Card, CardContent } from "@/components/ui/card";
import { compareInstruments } from "@/lib/compare-api";
import { VerdictCard } from "../components/verdict-card";
import { ScoreTable } from "../components/score-table";

interface CompareResultPageProps {
  readonly searchParams: Promise<{ readonly symbols?: string }>;
}

function isPending(
  result: ComparisonVerdict | PendingScoreResponse,
): result is PendingScoreResponse {
  return "error" in result && result.error === "SCORE_PENDING";
}

function ErrorCard({ message }: { readonly message: string }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-7">
        <p className="text-sm text-foreground">{message}</p>
        <Link
          href="/compare"
          className="inline-flex text-sm font-medium text-foreground underline underline-offset-4"
        >
          ← Back to compare
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * Compare result page (STOCK-07). Reads `?symbols=`, validates the 2-3
 * range server-side, server-fetches the verdict (cookie forwarded), and
 * renders either the VerdictCard + ScoreTable (200) or a friendly
 * score-pending card (422). Never client-only fetch — the verdict is
 * rendered on the server.
 */
export default async function CompareResultPage({
  searchParams,
}: CompareResultPageProps) {
  const { symbols: raw } = await searchParams;
  const symbols = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);

  return (
    <main className="container mx-auto max-w-2xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Comparison</h1>

      {symbols.length < 2 || symbols.length > 3 ? (
        <ErrorCard message="Pick 2 or 3 stocks to compare." />
      ) : (
        <CompareResult symbols={symbols} />
      )}
    </main>
  );
}

async function CompareResult({ symbols }: { readonly symbols: string[] }) {
  let result: ComparisonVerdict | PendingScoreResponse;
  try {
    result = await compareInstruments(symbols);
  } catch {
    return (
      <ErrorCard message="We couldn't generate this comparison right now. Please try again in a moment." />
    );
  }

  if (isPending(result)) {
    return (
      <Card>
        <CardContent className="space-y-2 p-7">
          <p className="text-sm font-medium text-foreground">
            Score pending for {result.symbol}
          </p>
          <p className="text-sm text-muted-foreground">
            We&apos;ll have the verdict once the next nightly recompute
            finishes — try again tomorrow.
          </p>
          <Link
            href="/compare"
            className="inline-flex pt-2 text-sm font-medium text-foreground underline underline-offset-4"
          >
            ← Back to compare
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <VerdictCard verdict={result} />
      <ScoreTable scores={result.scores} winnerSymbol={result.winnerSymbol} />
    </>
  );
}
