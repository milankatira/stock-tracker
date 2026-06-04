import type { Metadata } from "next";
import { ComparePicker } from "./components/compare-picker";

export const metadata: Metadata = {
  title: "Compare instruments · FinSight",
  description:
    "Compare 2-3 Indian stocks side by side and see which one has the higher FinSight Score — analysis only.",
};

/**
 * Compare picker page (STOCK-07). Server-rendered shell + client picker
 * island. The user selects 2-3 NSE/BSE stocks and submits to
 * `/compare/result`.
 */
export default function ComparePage() {
  return (
    <main className="container mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        Compare instruments
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick 2 or 3 NSE or BSE stocks. We&apos;ll highlight the higher-scoring
        pick — analysis only, never advice.
      </p>
      <div className="mt-8">
        <ComparePicker />
      </div>
    </main>
  );
}
