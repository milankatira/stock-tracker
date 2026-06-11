// TODO(i18n): wire copy through t() when the i18n helper ships.
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/**
 * Sample report — a hand-authored, static illustration of a FinSight report
 * card. Uses the Verdict enum vocabulary (Strong Score / Caution / Weak Score)
 * and Indian rupee formatting. No live data, no AI — purely for illustration.
 * Server Component. Subject: HDFC Bank (recognisable large-cap) with an
 * explicit non-affiliation caption.
 */
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const metrics: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Price (15-min delayed)", value: inr.format(1685) },
  { label: "Profit consistency", value: "8 / 10" },
  { label: "Volatility", value: "Low" },
  { label: "Promoter holding", value: "Stable" },
];

export function SampleReport() {
  return (
    <section
      id="sample"
      aria-labelledby="sample-heading"
      className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8"
    >
      <h2
        id="sample-heading"
        className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl"
      >
        See a sample report
      </h2>
      <Card className="mt-10">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl">HDFC Bank</CardTitle>
              <CardDescription>NSE: HDFCBANK</CardDescription>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-verdict-strong">
                7<span className="text-base text-muted-foreground">/10</span>
              </div>
              <Badge variant="secondary" className="mt-1">
                Strong Score
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            {metrics.map((m) => (
              <div key={m.label}>
                <dt className="text-xs text-muted-foreground">{m.label}</dt>
                <dd className="text-base font-medium">{m.value}</dd>
              </div>
            ))}
          </dl>
          <Separator className="my-4" />
          <p className="text-sm text-muted-foreground">
            Consistent profitability and a stable promoter base support a Strong
            Score. Watch event sensitivity around quarterly results. This is a
            worded analysis — you decide for yourself.
          </p>
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Sample report — for illustration only. FinSight AI is not affiliated
        with the company shown.
      </p>
    </section>
  );
}
