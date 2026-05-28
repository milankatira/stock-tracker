"use client";

import * as React from "react";
import type { InstrumentMatch } from "@finsight/shared";
import { searchInstruments } from "@/lib/api/search";
import { cn } from "@/lib/cn";

interface InstrumentSearchProps {
  readonly onSelect: (match: InstrumentMatch) => void;
  readonly placeholder?: string;
  readonly className?: string;
}

const DEBOUNCE_MS = 250;
const MIN_QUERY_LEN = 2;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function InstrumentSearch({
  onSelect,
  placeholder = "Search stocks or funds…",
  className,
}: InstrumentSearchProps) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<readonly InstrumentMatch[]>([]);
  const [isFetching, setIsFetching] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);

  React.useEffect(() => {
    if (debouncedQuery.trim().length < MIN_QUERY_LEN) {
      setResults([]);
      setIsFetching(false);
      return;
    }
    const ctrl = new AbortController();
    let cancelled = false;
    setIsFetching(true);
    searchInstruments(debouncedQuery, { signal: ctrl.signal })
      .then((items) => {
        if (cancelled) return;
        setResults(items);
        setIsFetching(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
        setIsFetching(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [debouncedQuery]);

  const stocks = results.filter((r) => r.type === "STOCK");
  const funds = results.filter((r) => r.type === "FUND");
  const showDropdown = open && query.trim().length >= MIN_QUERY_LEN;
  const hasResults = results.length > 0;

  return (
    <div className={cn("relative w-full", className)}>
      <input
        type="search"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="instrument-search-listbox"
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Defer so a click on a result still fires onSelect before close.
          setTimeout(() => setOpen(false), 150);
        }}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
      />
      {showDropdown ? (
        <div
          id="instrument-search-listbox"
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-md border border-border bg-card text-sm shadow-lg"
        >
          {isFetching && !hasResults ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
          ) : !hasResults ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {`No instruments match "${query}"`}
            </p>
          ) : (
            <>
              {stocks.length > 0 ? (
                <Group heading="Stocks">
                  {stocks.map((s) => (
                    <Row key={s.id} match={s} onSelect={onSelect}>
                      <span className="font-mono">{s.symbol}</span>
                      <span className="ml-3 text-muted-foreground">{s.name}</span>
                    </Row>
                  ))}
                </Group>
              ) : null}
              {funds.length > 0 ? (
                <Group heading="Mutual Funds">
                  {funds.map((f) => (
                    <Row key={f.id} match={f} onSelect={onSelect}>
                      <span>{f.name}</span>
                      <span className="ml-3 text-xs text-muted-foreground">
                        {f.symbol}
                      </span>
                    </Row>
                  ))}
                </Group>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Group({
  heading,
  children,
}: {
  readonly heading: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/40 last:border-b-0">
      <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </p>
      <ul>{children}</ul>
    </div>
  );
}

function Row({
  match,
  onSelect,
  children,
}: {
  readonly match: InstrumentMatch;
  readonly onSelect: (m: InstrumentMatch) => void;
  readonly children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={false}
        onMouseDown={(e) => {
          e.preventDefault();
          onSelect(match);
        }}
        className="flex w-full items-center px-3 py-2 text-left hover:bg-foreground/5 focus:bg-foreground/5 focus:outline-none"
      >
        {children}
      </button>
    </li>
  );
}
