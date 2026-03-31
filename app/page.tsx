import { getCurrentGrow } from "@/lib/db";
import { getDaysSince } from "@/utils/daysSinceSeeding";

function formatGermanDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function getHealthClasses(health: string): string {
  switch (health.toLowerCase()) {
    case "healthy":
      return "text-emerald-600 dark:text-emerald-400";
    case "warning":
      return "text-amber-600 dark:text-amber-400";
    case "critical":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-zinc-900 dark:text-zinc-100";
  }
}

export default async function Home() {
  const grow = await getCurrentGrow();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-8">
      <div className="flex w-full flex-col gap-6 lg:flex-row">
        <section className="w-full lg:w-2/3">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{grow.name}</h1>
            </div>
            <div className="aspect-video w-full">
              {grow.streamUrl ? (
                <iframe
                  className="h-full w-full"
                  src={grow.streamUrl}
                  title={`${grow.name} stream`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-100">
                  <p>Currently under maintenance</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="w-full lg:w-1/3">
          <div className="h-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Grow Info</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Plant</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.plant}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Strain</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.strain}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Plant Count</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.plantAmount}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Growing Medium</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.growSetup.growingMedium || "-"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Pot Size</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.growSetup.potSizeLiters || "-"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Start Date</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-100">{formatGermanDate(grow.seededAt)}</dd>
              </div>
            </dl>
            <p className="mt-5 border-t border-zinc-200 pt-4 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
              {grow.notes}
            </p>
          </div>
        </aside>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Current Status</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Stage</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.stage}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Age</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">{getDaysSince(grow.seededAt)} days</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Light Schedule</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.lightSchedule}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Plant Health</h2>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">Health Status</p>
              <p className={`mt-1 text-lg font-semibold ${getHealthClasses(grow.status.health)}`}>{grow.status.health}</p>
            </div>
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">Status Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">{grow.status.notes || "-"}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Setup</h2>
        <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{grow.growSetup.setupText || "-"}</p>
      </section>
    </main>
  );
}
