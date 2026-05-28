"use client";

import { useRouter } from "next/navigation";
import { InstrumentSearch } from "@/components/search/InstrumentSearch";

export default function SearchPage() {
  const router = useRouter();
  return (
    <main className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Find any Indian stock or mutual fund.
      </p>
      <div className="mt-6">
        <InstrumentSearch
          onSelect={(match) => {
            const path =
              match.type === "STOCK"
                ? `/stock/${encodeURIComponent(match.symbol)}`
                : `/fund/${encodeURIComponent(match.symbol)}`;
            router.push(path);
          }}
        />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Analysis only. Not investment advice.
      </p>
    </main>
  );
}
