import { getCurrentGrow } from "@/lib/db";

export default async function Home() {
  const grow = await getCurrentGrow();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-8 lg:flex-row">
      <section className="w-full lg:w-2/3">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{grow.name}</h1>
          </div>
          <div className="aspect-video w-full">
            {grow.streamUrl ? <iframe
                className="h-full w-full"
                src={grow.streamUrl}
                title={`${grow.name} stream`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
            /> : <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-100"><p>Currently
              under maintenance</p></div>}
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
              <dt className="text-zinc-500 dark:text-zinc-400">Stage</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.stage}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Seeded</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.seededAt}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Light</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.lightSchedule}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Updated</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.updatedAt}</dd>
            </div>
          </dl>
          <p className="mt-5 border-t border-zinc-200 pt-4 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
            {grow.notes}
          </p>
        </div>
      </aside>
    </main>
  );
}
