import { WatchlistTable } from "@/components/watchlist/WatchlistTable";

export default function WatchlistPage() {
  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your Watchlist</h1>
        <p className="text-xs text-muted-foreground">
          Scores refresh daily after market close.
        </p>
      </header>
      <WatchlistTable />
      <p className="mt-8 text-xs text-muted-foreground">
        Analysis only. Not investment advice.
      </p>
    </main>
  );
}
