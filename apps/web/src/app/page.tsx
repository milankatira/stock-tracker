import { apiFetch } from "@/lib/api-client";
import { SHARED_SENTINEL } from "@finsight/shared";

interface PingResponse {
  readonly ok: boolean;
  readonly message: string;
  readonly sharedSentinel: string;
}

export default async function HomePage() {
  let api: PingResponse | null = null;
  let apiError: string | null = null;

  try {
    api = await apiFetch<PingResponse>("/ping");
  } catch (err) {
    // API not running locally — render skeleton. Build must not depend on
    // a live API connection.
    apiError =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "API unreachable";
  }

  const match = api?.sharedSentinel === SHARED_SENTINEL;

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight">FinSight AI</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Plain-English investment analysis for India.
        </p>

        <section className="mt-8 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Monorepo proof-of-life</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Web sentinel</dt>
              <dd className="font-mono">{SHARED_SENTINEL}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">API sentinel</dt>
              <dd className="font-mono">
                {api?.sharedSentinel ?? "(api not running)"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Match</dt>
              <dd className="font-mono">{match ? "yes" : "no"}</dd>
            </div>
            {apiError ? (
              <div className="flex justify-between text-amber-700">
                <dt>API note</dt>
                <dd className="font-mono">{apiError}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>
    </main>
  );
}
