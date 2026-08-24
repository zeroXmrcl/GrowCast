import Link from "next/link";
import {notFound} from "next/navigation";
import {EnergyArchiveSection} from "@/components/energy-scoreboard";
import SnapshotGallery from "@/components/snapshot-gallery";
import TimelapsePlayer from "@/components/timelapse-player";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {
    archiveMediaUrl,
    getArchivedGrow,
    getArchivePictureFiles,
    getArchiveSnapshotFiles,
    getArchiveTimelapseFile,
} from "@/lib/archives";
import {buildEnergyDto} from "@/lib/energy/scoreboard";
import {formatDateDisplay, growDurationDays} from "../format";

export const dynamic = "force-dynamic";

type InfoRowProps = {
    label: string;
    value: string;
};

function InfoRow({label, value}: InfoRowProps) {
    return (
        <div className="flex justify-between gap-3">
            <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
            <dd className="text-right text-zinc-900 dark:text-zinc-100">{value}</dd>
        </div>
    );
}

function dayNightValue(day: number, night: number, unit: string): string | null {
    const hasDay = day !== 0;
    const hasNight = night !== 0;

    if (!hasDay && !hasNight) {
        return null;
    }
    if (hasDay && hasNight) {
        return `${day} / ${night}${unit}`;
    }
    return `${hasDay ? day : night}${unit}`;
}

export default async function ArchivedGrowPage({
    params,
}: {
    params: Promise<{archiveId: string}>;
}) {
    const {archiveId} = await params;
    const archive = await getArchivedGrow(archiveId);

    if (!archive) {
        notFound();
    }

    const isAdmin = await isAdminAuthenticated();
    const [snapshotFiles, pictureFiles, timelapseFile, energy] = await Promise.all([
        getArchiveSnapshotFiles(archiveId),
        getArchivePictureFiles(archiveId),
        getArchiveTimelapseFile(archiveId),
        buildEnergyDto({
            grow: archiveId,
            tariffKind: isAdmin ? "private" : "public",
        }),
    ]);

    const snapshots = snapshotFiles.map((name) => ({
        name,
        url: archiveMediaUrl(archiveId, "snapshots", name),
    }));
    const pictures = pictureFiles.map((name) => ({
        name,
        url: archiveMediaUrl(archiveId, "pictures", name),
    }));
    const videoUrl = timelapseFile
        ? archiveMediaUrl(archiveId, "timelapse", timelapseFile)
        : null;

    const {grow, completion} = archive;
    const duration = growDurationDays(grow.details.seededAt, completion.harvestedAt);
    const subtitle = [grow.plant, grow.details.strain].filter(Boolean).join(" • ");
    const temperature = dayNightValue(
        grow.climate.temperatureDay,
        grow.climate.temperatureNight,
        " C",
    );
    const humidity = dayNightValue(
        grow.climate.humidityDay,
        grow.climate.humidityNight,
        "%",
    );

    return (
        <main className="flex flex-1 flex-col gap-10 py-10 text-zinc-900 dark:text-zinc-100">
                <div>
                    <Link
                        href="/grows"
                        className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                        &larr; Past Grows
                    </Link>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight">{grow.name}</h1>
                    {subtitle ? (
                        <p className="mt-1 text-zinc-600 dark:text-zinc-300">{subtitle}</p>
                    ) : null}
                </div>

                <section className="grid gap-6 lg:grid-cols-2">
                    <article className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                            Grow Info
                        </h2>
                        <dl className="space-y-3 text-sm">
                            {grow.plant ? <InfoRow label="Plant" value={grow.plant}/> : null}
                            {grow.details.strain ? (
                                <InfoRow label="Strain" value={grow.details.strain}/>
                            ) : null}
                            {grow.plantAmount !== 0 ? (
                                <InfoRow label="Plant Count" value={String(grow.plantAmount)}/>
                            ) : null}
                            {grow.growSetup.growingMedium ? (
                                <InfoRow label="Growing Medium" value={grow.growSetup.growingMedium}/>
                            ) : null}
                            {grow.growSetup.potSizeLiters !== 0 ? (
                                <InfoRow label="Pot Size" value={`${grow.growSetup.potSizeLiters} L`}/>
                            ) : null}
                            {grow.details.lightSchedule ? (
                                <InfoRow label="Light Schedule" value={grow.details.lightSchedule}/>
                            ) : null}
                            {temperature ? (
                                <InfoRow label="Temperature (D/N)" value={temperature}/>
                            ) : null}
                            {humidity ? <InfoRow label="Humidity (D/N)" value={humidity}/> : null}
                        </dl>
                    </article>

                    <article className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                            Harvest
                        </h2>
                        <dl className="space-y-3 text-sm">
                            <InfoRow label="Seeded" value={formatDateDisplay(grow.details.seededAt)}/>
                            <InfoRow
                                label="Harvested"
                                value={formatDateDisplay(completion.harvestedAt)}
                            />
                            {duration !== null ? (
                                <InfoRow label="Duration" value={`${duration} days`}/>
                            ) : null}
                            {completion.yieldGrams !== null ? (
                                <InfoRow label="Yield" value={`${completion.yieldGrams} g`}/>
                            ) : null}
                        </dl>
                        {completion.finalNotes ? (
                            <div className="mt-5 border-t border-zinc-200 pt-4 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                                <p className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
                                    Final Notes
                                </p>
                                <p className="whitespace-pre-wrap">{completion.finalNotes}</p>
                            </div>
                        ) : null}
                    </article>
                </section>

                {energy.ok ? <EnergyArchiveSection dto={energy.dto}/> : null}

                {videoUrl ? <TimelapsePlayer videoUrl={videoUrl}/> : null}
                <SnapshotGallery snapshots={snapshots}/>

                {pictures.length > 0 ? (
                    <section className="space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                Pictures
                            </h2>
                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                                {pictures.length} images available
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {pictures.map((picture) => (
                                <a
                                    key={picture.name}
                                    href={picture.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                                >
                                    <div className="aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={picture.url}
                                            alt={picture.name}
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                        />
                                    </div>
                                </a>
                            ))}
                        </div>
                    </section>
                ) : null}
        </main>
    );
}
