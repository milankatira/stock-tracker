"use client";

import { useEffect, useMemo, useState } from "react";
import { isApiError, type ScoreInput, type ScoreResult } from "@finsight/shared";
import {
  apiFetch,
  createSavedReport,
  fetchCurrentSession,
  getSavedReport,
  listSavedReports,
  type SavedReport,
} from "@/lib/api-client";

type MetricKey = keyof ScoreInput;

interface ReportFormState extends ScoreInput {
  readonly assetName: string;
  readonly assetType: "stock";
  readonly symbol: string;
}

interface Quote {
  readonly symbol: string;
  readonly price: number;
  readonly currency: "INR";
  readonly asOf: string;
  readonly source: string;
}

interface ReportView {
  readonly id?: string;
  readonly asset: {
    readonly name: string;
    readonly type: "stock";
    readonly symbol: string;
  };
  readonly quote: Quote;
  readonly score: ScoreResult;
  readonly citations: readonly string[];
  readonly narrative: string;
  readonly createdAt?: string;
}

type AuthState = "unknown" | "signed-in" | "signed-out";
type HistoryState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; items: readonly SavedReport[] }
  | { kind: "error"; message: string };

const metricFields: readonly { key: MetricKey; label: string }[] = [
  { key: "valuation", label: "Valuation" },
  { key: "growth", label: "Growth" },
  { key: "profitability", label: "Profitability" },
  { key: "balanceSheet", label: "Balance sheet" },
  { key: "momentum", label: "Momentum" },
  { key: "risk", label: "Risk" },
];

const initialForm: ReportFormState = {
  assetName: "Reliance Industries",
  assetType: "stock",
  symbol: "RELIANCE",
  valuation: 72,
  growth: 68,
  profitability: 74,
  balanceSheet: 70,
  momentum: 64,
  risk: 35,
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ReportWorkspace() {
  const [form, setForm] = useState<ReportFormState>(initialForm);
  const [report, setReport] = useState<ReportView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [auth, setAuth] = useState<AuthState>("unknown");
  const [history, setHistory] = useState<HistoryState>({ kind: "idle" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistory({ kind: "loading" });
    void fetchCurrentSession()
      .then(async (session) => {
        if (cancelled) return;
        if (!session) {
          setAuth("signed-out");
          setHistory({ kind: "idle" });
          return;
        }
        setAuth("signed-in");
        try {
          const list = await listSavedReports();
          if (cancelled) return;
          setHistory({ kind: "ready", items: list.items });
        } catch (err) {
          if (cancelled) return;
          setHistory({ kind: "error", message: errorMessage(err) });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAuth("signed-out");
        setHistory({ kind: "error", message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const verdictLabel = useMemo(
    () => report?.score.verdict.replaceAll("_", " "),
    [report],
  );

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (auth === "signed-in") {
        const saved = await createSavedReport(form);
        setReport(toView(saved));
        setSelectedId(saved.id);
        setHistory((current) => insertReport(current, saved));
      } else {
        const fresh = await apiFetch<ReportView>("/analysis/report", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setReport(fresh);
        setSelectedId(null);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function selectSavedReport(id: string) {
    if (auth !== "signed-in") return;
    setError(null);
    setIsLoading(true);
    try {
      const saved = await getSavedReport(id);
      setReport(toView(saved));
      setSelectedId(saved.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  function updateTextField(key: "assetName" | "symbol", value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateMetric(key: MetricKey, value: string) {
    setForm((current) => ({ ...current, [key]: Number(value) }));
  }

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-neutral-950">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">FinSight AI</h1>
            <p className="text-sm text-neutral-600">Indian equity report desk</p>
          </div>
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
            NSE
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-0 px-5 py-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4 lg:border-r-0">
          <form
            className="border border-neutral-200 bg-white p-5"
            onSubmit={submitReport}
          >
            <div className="space-y-4">
              <label className="block text-sm font-medium text-neutral-700">
                Asset name
                <input
                  className="mt-1 w-full border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 outline-none focus:border-emerald-600"
                  value={form.assetName}
                  onChange={(event) => updateTextField("assetName", event.target.value)}
                />
              </label>

              <label className="block text-sm font-medium text-neutral-700">
                Symbol
                <input
                  className="mt-1 w-full border border-neutral-300 bg-white px-3 py-2 text-sm uppercase text-neutral-950 outline-none focus:border-emerald-600"
                  value={form.symbol}
                  onChange={(event) => updateTextField("symbol", event.target.value)}
                />
              </label>

              <div className="grid grid-cols-2 gap-2" aria-label="Asset type">
                <button
                  className="border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900"
                  type="button"
                >
                  Stock
                </button>
                <button
                  className="border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                  type="button"
                  disabled
                >
                  Fund
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {metricFields.map((field) => (
                <label
                  key={field.key}
                  className="block text-sm font-medium text-neutral-700"
                >
                  <span className="flex items-center justify-between">
                    <span>{field.label}</span>
                    <span className="tabular-nums text-neutral-950">
                      {form[field.key]}
                    </span>
                  </span>
                  <input
                    className="mt-2 w-full accent-emerald-700"
                    max={100}
                    min={0}
                    onChange={(event) => updateMetric(field.key, event.target.value)}
                    type="range"
                    value={form[field.key]}
                  />
                </label>
              ))}
            </div>

            <button
              className="mt-6 w-full border border-neutral-950 bg-neutral-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-300"
              disabled={isLoading}
              type="submit"
            >
              {isLoading ? "Generating" : "Generate report"}
            </button>

            {error ? (
              <p className="mt-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            ) : null}
          </form>

          <HistoryRail
            auth={auth}
            history={history}
            selectedId={selectedId}
            onSelect={selectSavedReport}
          />
        </div>

        <section className="border border-neutral-200 bg-[#fbfbf8] p-5">
          {report ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-normal">
                    {report.asset.name}
                  </h2>
                  <p className="mt-1 text-sm text-neutral-600">{report.asset.symbol}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-semibold tabular-nums">
                    {report.score.score}/10
                  </p>
                  <p className="text-sm text-emerald-800">{verdictLabel}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MetricTile label="Price" value={currency.format(report.quote.price)} />
                <MetricTile label="Currency" value={report.quote.currency} />
                <MetricTile
                  label="As of"
                  value={dateTime.format(new Date(report.quote.asOf))}
                />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-neutral-700">Insight cards</h3>
                <div className="mt-3 space-y-3">
                  {report.score.insightCards.map((card) => (
                    <div key={card.label}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-neutral-800">{card.label}</span>
                        <span className="tabular-nums text-neutral-600">
                          {card.score}/100
                        </span>
                      </div>
                      <div className="mt-1 h-2 bg-neutral-200">
                        <div
                          className="h-2 bg-emerald-700"
                          style={{ width: `${card.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-neutral-200 pt-4">
                <h3 className="text-sm font-semibold text-neutral-700">Narrative</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-800">
                  {report.narrative}
                </p>
              </div>

              <div className="border-t border-neutral-200 pt-4">
                <h3 className="text-sm font-semibold text-neutral-700">Citations</h3>
                <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                  {report.citations.map((citation) => (
                    <li key={citation}>{citation}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="grid min-h-[620px] place-items-center text-center">
              <div>
                <p className="text-5xl font-semibold tabular-nums text-neutral-300">
                  0/10
                </p>
                <p className="mt-2 text-sm text-neutral-500">No report loaded</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

interface HistoryRailProps {
  readonly auth: AuthState;
  readonly history: HistoryState;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

function HistoryRail({ auth, history, selectedId, onSelect }: HistoryRailProps) {
  if (auth === "signed-out") {
    return (
      <aside
        aria-label="Saved history"
        className="border border-neutral-200 bg-white p-4 text-sm text-neutral-600"
      >
        <h3 className="text-sm font-semibold text-neutral-700">Saved history</h3>
        <p className="mt-2">Sign in to keep a history of every report you generate.</p>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Saved history"
      className="border border-neutral-200 bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-neutral-700">Saved history</h3>
      <HistoryContent history={history} selectedId={selectedId} onSelect={onSelect} />
    </aside>
  );
}

function HistoryContent({
  history,
  selectedId,
  onSelect,
}: {
  readonly history: HistoryState;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}) {
  if (history.kind === "loading" || history.kind === "idle") {
    return <p className="mt-2 text-sm text-neutral-500">Loading your history…</p>;
  }
  if (history.kind === "error") {
    return (
      <p className="mt-2 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
        {history.message}
      </p>
    );
  }
  if (history.items.length === 0) {
    return (
      <p className="mt-2 text-sm text-neutral-500">
        No saved reports yet. Generate one to start your history.
      </p>
    );
  }
  return (
    <ul className="mt-3 space-y-2" role="list">
      {history.items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            aria-pressed={selectedId === item.id}
            onClick={() => onSelect(item.id)}
            className={
              selectedId === item.id
                ? "flex w-full items-center justify-between border border-emerald-600 bg-emerald-50 px-3 py-2 text-left text-sm"
                : "flex w-full items-center justify-between border border-neutral-200 bg-white px-3 py-2 text-left text-sm hover:border-neutral-400"
            }
          >
            <span className="flex flex-col">
              <span className="font-medium text-neutral-900">{item.asset.name}</span>
              <span className="text-xs text-neutral-500">
                {item.asset.symbol} · {dateTime.format(new Date(item.createdAt))}
              </span>
            </span>
            <span className="flex items-center gap-2 text-xs">
              <span className="tabular-nums text-neutral-700">
                {item.score.score}/10
              </span>
              <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
                {item.status}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MetricTile({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="border border-neutral-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-normal text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-neutral-950">{value}</p>
    </div>
  );
}

function toView(saved: SavedReport): ReportView {
  return {
    id: saved.id,
    asset: saved.asset,
    quote: saved.quote,
    score: saved.score,
    citations: saved.citations,
    narrative: saved.narrative,
    createdAt: saved.createdAt,
  };
}

function insertReport(state: HistoryState, saved: SavedReport): HistoryState {
  if (state.kind === "ready") {
    const filtered = state.items.filter((item) => item.id !== saved.id);
    return { kind: "ready", items: [saved, ...filtered] };
  }
  return { kind: "ready", items: [saved] };
}

function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return "Report request failed";
}
