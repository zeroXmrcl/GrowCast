import {getCurrentGrow} from "@/lib/db";
import DashPictures from "@/components/dash-pictures";
import LiveTentRow from "@/components/live-tent-row";
import {formatDateDisplay, hasGrowStartDate} from "@/app/(site)/grows/format";
import {PUBLIC_FOCUS, PUBLIC_HIT, PUBLIC_MEDIA_LINK} from "@/lib/public-ui";
import {hasGgsLiveUi} from "@/lib/ggs-live-store";
import {getDaysSince} from "@/utils/daysSinceSeeding";
import {listMediaUrls} from "@/lib/media-library";
import ReactMarkdown from "react-markdown";
import Image from "next/image";
import {markdownUrlTransform, safeHttpUrlOrEmpty} from "@/lib/url-policy";
import {
    WORKSPACE_AREA,
    WORKSPACE_HAIRLINE,
    WORKSPACE_PAD,
    WORKSPACE_SPLIT_MID,
    WORKSPACE_TITLE,
    WORKSPACE_VT,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

/* TODO Light widget (schedule/PPFD)*/

function getHealthColor(health: string): string {
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

type DayOrNightProps = {
    label: string;
    day: number;
    night: number;
    unit: string;
};

function DayOrNight({label, day, night, unit}: DayOrNightProps) {
    const hasDay = day !== 0;
    const hasNight = night !== 0;

    if (!hasDay && !hasNight) {
        return null;
    }

    const metricLabel = hasDay && hasNight
        ? `${label} (D/N)`
        : `${label} ${hasDay ? "Day" : "Night"}`;

    const value = hasDay && hasNight
        ? `${day} / ${night}${unit}`
        : `${hasDay ? day : night}${unit}`;

    return (
        <div className="flex justify-between gap-3">
            <dt className="text-zinc-500 dark:text-zinc-400">{metricLabel}</dt>
            <dd className="text-right text-zinc-900 dark:text-zinc-100">{value}</dd>
        </div>
    );
}

function DetailRow({label, value}: {label: string; value: string}) {
    return (
        <div className="flex justify-between gap-3">
            <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
            <dd className="text-right text-zinc-900 dark:text-zinc-100">{value}</dd>
        </div>
    );
}

export default async function Home() {
    const [grow, setupImages, showLiveClimate] = await Promise.all([
        getCurrentGrow(),
        listMediaUrls("setup"),
        hasGgsLiveUi(),
    ]);
    const details = grow.details;
    const socialLinks = [
        {
            label: "YouTube",
            href: safeHttpUrlOrEmpty(grow.socials.youtube),
            iconSrc: "https://cdn.simpleicons.org/youtube/71717a",
        },
        {
            label: "X",
            href: safeHttpUrlOrEmpty(grow.socials.twitter),
            iconSrc: "https://cdn.simpleicons.org/x/71717a",
        },
        {
            label: "Instagram",
            href: safeHttpUrlOrEmpty(grow.socials.instagram),
            iconSrc: "https://cdn.simpleicons.org/instagram/71717a",
        },
        {
            label: "GrowDiaries",
            href: safeHttpUrlOrEmpty(grow.socials.growDiaries),
            iconSrc: "/growdiaries.svg",
        },
        {
            label: "Discord",
            href: safeHttpUrlOrEmpty(grow.socials.discordInvite),
            iconSrc: "https://cdn.simpleicons.org/discord/71717a",
        },
        {
            label: "Custom Website",
            href: safeHttpUrlOrEmpty(grow.socials.customWebsite),
            iconSrc: "/globe.svg",
        },
    ].filter(({href}) => href.length > 0);
    const startDate = hasGrowStartDate(details.seededAt)
        ? formatDateDisplay(details.seededAt)
        : null;
    const health = grow.status.health.trim();
    const vitalNotes = grow.status.notes.trim();
    const hasDetails =
        Boolean(grow.plant)
        || Boolean(details.strain)
        || grow.plantAmount !== 0
        || Boolean(grow.growSetup.growingMedium)
        || grow.growSetup.potSizeLiters !== 0
        || grow.climate.temperatureDay !== 0
        || grow.climate.temperatureNight !== 0
        || grow.climate.humidityDay !== 0
        || grow.climate.humidityNight !== 0
        || Boolean(startDate)
        || Boolean(details.notes.trim());
    const hasStatus =
        Boolean(details.stage.trim())
        || startDate !== null
        || Boolean(details.lightSchedule.trim());

    return (
        <>
            <aside className={`${WORKSPACE_AREA.details} ${WORKSPACE_VT.side} ${WORKSPACE_PAD}`}>
                <h2 className={WORKSPACE_TITLE}>Details</h2>
                {hasDetails ? (
                    <>
                        <dl className="space-y-3 text-sm">
                            {grow.plant ? <DetailRow label="Plant" value={grow.plant} /> : null}
                            {details.strain ? <DetailRow label="Strain" value={details.strain} /> : null}
                            {grow.plantAmount !== 0 ? (
                                <DetailRow label="Plant Count" value={String(grow.plantAmount)} />
                            ) : null}
                            {grow.growSetup.growingMedium ? (
                                <DetailRow label="Growing Medium" value={grow.growSetup.growingMedium} />
                            ) : null}
                            {grow.growSetup.potSizeLiters !== 0 ? (
                                <DetailRow label="Pot Size" value={`${grow.growSetup.potSizeLiters} L`} />
                            ) : null}
                            <DayOrNight
                                label="Temperature"
                                day={grow.climate.temperatureDay}
                                night={grow.climate.temperatureNight}
                                unit=" C"
                            />
                            <DayOrNight
                                label="Humidity"
                                day={grow.climate.humidityDay}
                                night={grow.climate.humidityNight}
                                unit="%"
                            />
                            {startDate ? <DetailRow label="Start Date" value={startDate} /> : null}
                        </dl>
                        {details.notes ? (
                            <div className="mt-5 border-t border-zinc-200 pt-4 text-sm leading-6 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300 whitespace-pre-line">
                                <ReactMarkdown urlTransform={markdownUrlTransform}>
                                    {details.notes}
                                </ReactMarkdown>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                        No grow details yet.
                    </p>
                )}
            </aside>

            {showLiveClimate ? (
                <LiveTentRow climateTick={grow.climateTick} devicesDesign={grow.devicesDesign}/>
            ) : null}

            <section className={`${WORKSPACE_AREA.run} ${WORKSPACE_VT.flow} grid lg:grid-cols-2`}>
                <article className={`${WORKSPACE_PAD} ${WORKSPACE_SPLIT_MID}`}>
                    <h2 className={WORKSPACE_TITLE}>Status</h2>
                    {hasStatus ? (
                        <dl className="space-y-3 text-sm">
                            {details.stage.trim() ? <DetailRow label="Stage" value={details.stage} /> : null}
                            {startDate ? (
                                <DetailRow label="Age" value={`${getDaysSince(details.seededAt)} days`} />
                            ) : null}
                            {details.lightSchedule.trim() ? (
                                <DetailRow label="Light Schedule" value={details.lightSchedule} />
                            ) : null}
                        </dl>
                    ) : (
                        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                            No status for this grow yet.
                        </p>
                    )}
                </article>

                <article className={WORKSPACE_PAD}>
                    <h2 className={WORKSPACE_TITLE}>Vitals</h2>
                    <div className="space-y-3 text-sm">
                        <div>
                            <p className="text-zinc-500 dark:text-zinc-400">Health</p>
                            <p className={`mt-1 text-lg font-semibold tracking-tight ${health ? getHealthColor(health) : "text-zinc-600 dark:text-zinc-400"}`}>
                                {health || "No health update yet."}
                            </p>
                        </div>
                        <div>
                            <p className="text-zinc-500 dark:text-zinc-400">Notes</p>
                            <p className={`mt-1 whitespace-pre-wrap ${vitalNotes ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400"}`}>
                                {vitalNotes || "No notes yet."}
                            </p>
                        </div>
                    </div>
                </article>
            </section>

            <DashPictures />

            {(grow.growSetup.setupText?.trim() || setupImages.length > 0) && (
                <section className={`${WORKSPACE_AREA.setup} ${WORKSPACE_VT.table} ${WORKSPACE_PAD}`}>
                    <h2 className={WORKSPACE_TITLE}>
                        Setup
                    </h2>

                    {grow.growSetup.setupText?.trim() ? (
                        <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                            <ReactMarkdown urlTransform={markdownUrlTransform}>
                                {grow.growSetup.setupText}
                            </ReactMarkdown>
                        </div>
                    ) : null}

                    {setupImages.length > 0 && (
                        <div className="-mx-4 -mb-4 mt-4 grid grid-cols-2 sm:-mx-6 sm:-mb-6 md:grid-cols-3">
                            {setupImages.map((src, index) => (
                                <a
                                    key={src}
                                    href={src}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`${PUBLIC_MEDIA_LINK} overflow-hidden ${
                                        index < setupImages.length - 1 ? `border-r ${WORKSPACE_HAIRLINE}` : ""
                                    } max-md:nth-[2n]:border-r-0 md:nth-[3n]:border-r-0`}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={src}
                                        alt={`Grow setup photo ${index + 1}`}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                    />
                                </a>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {socialLinks.length > 0 && (
                <section className={`${WORKSPACE_AREA.socials} ${WORKSPACE_VT.socials} ${WORKSPACE_PAD}`}>
                    <div className="flex flex-wrap items-center justify-evenly gap-3">
                        {socialLinks.map(({label, href, iconSrc}) => (
                            <a
                                key={label}
                                href={href}
                                aria-label={label}
                                title={label}
                                target="_blank"
                                rel="noreferrer"
                                className={`group ${PUBLIC_HIT} rounded-md ${PUBLIC_FOCUS} text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100`}
                            >
                                <Image
                                    src={iconSrc}
                                    alt=""
                                    width={20}
                                    height={20}
                                    unoptimized
                                    className="h-5 w-5 grayscale opacity-80 transition-opacity group-hover:opacity-100"
                                />
                            </a>
                        ))}
                    </div>
                </section>
            )}
        </>
    );
}
