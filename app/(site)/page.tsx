import {getCurrentGrow} from "@/lib/db";
import DashPictures from "@/components/dash-pictures";
import LiveTentRow from "@/components/live-tent-row";
import {formatDateDisplay} from "@/app/(site)/grows/format";
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

    return (
        <>
            <aside className={`${WORKSPACE_AREA.details} ${WORKSPACE_VT.side} ${WORKSPACE_PAD}`}>
                <h2 className={WORKSPACE_TITLE}>Details</h2>
                <dl className="space-y-3 text-sm">
                    {grow.plant && (<div className="flex justify-between gap-3">
                        <dt className="text-zinc-500 dark:text-zinc-400">Plant</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.plant}</dd>
                    </div>)}
                    {details.strain && (<div className="flex justify-between gap-3">
                        <dt className="text-zinc-500 dark:text-zinc-400">Strain</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">{details.strain}</dd>
                    </div>)}
                    {(grow.plantAmount != 0) && (<div className="flex justify-between gap-3">
                        <dt className="text-zinc-500 dark:text-zinc-400">Plant Count</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.plantAmount}</dd>
                    </div>)}
                    {grow.growSetup.growingMedium && (<div className="flex justify-between gap-3">
                        <dt className="text-zinc-500 dark:text-zinc-400">Growing Medium</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.growSetup.growingMedium}</dd>
                    </div>)}
                    {(grow.growSetup.potSizeLiters != 0) && (<div className="flex justify-between gap-3">
                        <dt className="text-zinc-500 dark:text-zinc-400">Pot Size</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">{grow.growSetup.potSizeLiters}</dd>
                    </div>)}
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
                    {(formatDateDisplay(details.seededAt) != '01.01.2001') && (
                        <div className="flex justify-between gap-3">
                            <dt className="text-zinc-500 dark:text-zinc-400">Start Date</dt>
                            <dd className="text-right text-zinc-900 dark:text-zinc-100">{formatDateDisplay(details.seededAt)}</dd>
                        </div>)}
                </dl>
                {details.notes && (
                    <div
                        className="mt-5 border-t border-zinc-200 pt-4 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300 whitespace-pre-line">
                        <ReactMarkdown urlTransform={markdownUrlTransform}>
                            {details.notes}
                        </ReactMarkdown>
                    </div>)}
            </aside>

            {showLiveClimate ? (
                <LiveTentRow climateTick={grow.climateTick} devicesDesign={grow.devicesDesign}/>
            ) : null}

            <section className={`${WORKSPACE_AREA.run} ${WORKSPACE_VT.flow} grid lg:grid-cols-2`}>
                <article className={`${WORKSPACE_PAD} ${WORKSPACE_SPLIT_MID}`}>
                    <h2 className={WORKSPACE_TITLE}>Status</h2>
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between gap-3">
                            <dt className="text-zinc-500 dark:text-zinc-400">Stage</dt>
                            <dd className="text-right text-zinc-900 dark:text-zinc-100">{details.stage}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-zinc-500 dark:text-zinc-400">Age</dt>
                            <dd className="text-right text-zinc-900 dark:text-zinc-100">{getDaysSince(details.seededAt)} days</dd>
                        </div>
                        {details.lightSchedule && (<div className="flex justify-between gap-3">
                            <dt className="text-zinc-500 dark:text-zinc-400">Light Schedule</dt>
                            <dd className="text-right text-zinc-900 dark:text-zinc-100">{details.lightSchedule}</dd>
                        </div>)}
                    </dl>
                </article>

                <article className={WORKSPACE_PAD}>
                    <h2 className={WORKSPACE_TITLE}>Vitals</h2>
                    <div className="space-y-3 text-sm">
                        <div>
                            <p className="text-zinc-500 dark:text-zinc-400">Status</p>
                            <p className={`mt-1 text-lg font-semibold ${getHealthColor(grow.status.health)}`}>{grow.status.health}</p>
                        </div>
                        <div>
                            <p className="text-zinc-500 dark:text-zinc-400">Notes</p>
                            <p className="mt-1 whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">{grow.status.notes || "-"}</p>
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
                        <div className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                            <ReactMarkdown urlTransform={markdownUrlTransform}>
                                {grow.growSetup.setupText}
                            </ReactMarkdown>
                        </div>
                    ) : null}

                    {setupImages.length > 0 && (
                        <div className="-mx-4 -mb-4 mt-4 grid grid-cols-2 sm:-mx-[18px] sm:-mb-[18px] md:grid-cols-3">
                            {setupImages.map((src, index) => (
                                <a
                                    key={src}
                                    href={src}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`overflow-hidden ${
                                        index < setupImages.length - 1 ? `border-r ${WORKSPACE_HAIRLINE}` : ""
                                    } max-md:nth-[2n]:border-r-0 md:nth-[3n]:border-r-0`}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={src}
                                        alt=""
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
                                className="group inline-flex  items-center justify-center transition-colors"
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
