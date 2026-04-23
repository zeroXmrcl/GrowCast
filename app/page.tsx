import { getCurrentGrow } from "@/lib/db";
import { getDaysSince } from "@/utils/daysSinceSeeding";
import getSetupImages from "@/lib/getSetupImages";
import SiteFooter from "@/components/site-footer";
import ReactMarkdown from "react-markdown";
import Image from "next/image";

export const dynamic = "force-dynamic";

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
  const setupImages = getSetupImages();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-8">
      <div className="flex w-full flex-col gap-6 lg:flex-row">
        <section className="w-full lg:w-2/3">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100  dark:border-zinc-800 dark:bg-zinc-900">
            {grow.showGrowName ? (
              <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{grow.name}</h1>
              </div>
            ) : null}
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
          <div className="h-full rounded-2xl border border-zinc-200 bg-white p-5  dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Grow Info</h2>
            <dl className="space-y-3 text-sm">
              {grow.plant && (<div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Plant</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.plant}</dd>
              </div>)}
              {grow.strain && (<div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Strain</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.strain}</dd>
              </div>)}
              {(grow.plantAmount != 0) && (<div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Plant Count</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.plantAmount}</dd>
              </div>)}
              {grow.growSetup.growingMedium && (<div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Growing Medium</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.growSetup.growingMedium || "-"}</dd>
              </div>)}
              {(grow.growSetup.potSizeLiters != 0) && (<div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Pot Size</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.growSetup.potSizeLiters || "-"}</dd>
              </div>)}
              {(formatGermanDate(grow.seededAt) != '01.01.2001') && (<div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Start Date</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-100">{formatGermanDate(grow.seededAt)}</dd>
              </div>)}
            </dl>
            {grow.notes && (
              <div className="mt-5 border-t border-zinc-200 pt-4 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300 whitespace-pre-line">
                <ReactMarkdown>
                    {grow.notes}
                </ReactMarkdown>
              </div>)}
          </div>
        </aside>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-zinc-200 bg-white p-5  dark:border-zinc-800 dark:bg-zinc-950">
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
            {grow.lightSchedule && (<div className="flex justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Light Schedule</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.lightSchedule}</dd>
            </div>)}
          </dl>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-5  dark:border-zinc-800 dark:bg-zinc-950">
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

      {grow.growSetup.setupText?.trim() && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5  dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Setup
            </h2>

            <div className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              <ReactMarkdown>
                {grow.growSetup.setupText}
              </ReactMarkdown>
            </div>

            {setupImages.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                  {setupImages.map((src, i) => (
                      <Image
                          key={i}
                          src={src}
                          alt={`${i + 1}`}
                          width={500}
                          height={500}
                          className="rounded-xl border border-zinc-200 dark:border-zinc-800"
                      />
                  ))}
                </div>
            )}
          </section>
      )}
      <SiteFooter />
    </main>
  );
}
