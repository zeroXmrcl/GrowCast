import Image from "next/image";
import Link from "next/link";
import {
    AdminButton,
    AdminCheckboxRow,
    AdminField,
    AdminInput,
    AdminNotice,
    AdminPanel,
    AdminSelect,
    AdminTextarea,
    NavLink,
} from "@/components/admin/ui";
import MediaManager from "@/app/admin/media-manager";
import type {GrowRecord} from "@/lib/db";
import type {Tone} from "@/components/admin/ui";
import type {TimelapseSettings} from "@/lib/timelapse-settings";

const sectionLinks = [
    {href: "#general", label: "General"},
    {href: "#lifecycle", label: "Lifecycle"},
    {href: "#climate", label: "Climate"},
    {href: "#status", label: "Status"},
    {href: "#notes", label: "Notes"},
    {href: "#hardware", label: "Hardware"},
    {href: "#stream", label: "Stream"},
    {href: "#timelapse", label: "Timelapse"},
    {href: "#socials", label: "Socials"},
    {href: "#pictures", label: "Pictures"},
    {href: "#archive", label: "Archive"},
];

type NoticeContent = {tone: Tone; title: string; body: string};

const MEDIA_NOTICES: Record<string, NoticeContent> = {
    uploaded: {tone: "success", title: "Pictures uploaded", body: "Done."},
    uploaded_partial: {
        tone: "warning",
        title: "Some pictures were skipped",
        body: "Files that are not valid JPEG/PNG/WebP images or exceed 15 MB were skipped. The rest were uploaded.",
    },
    deleted: {tone: "success", title: "Picture deleted", body: "Done."},
};

const MEDIA_ERROR_NOTICES: Record<string, NoticeContent> = {
    media_no_files: {
        tone: "warning",
        title: "No files selected",
        body: "Choose at least one image to upload.",
    },
    media_too_many_files: {
        tone: "warning",
        title: "Too many files",
        body: "Upload at most 10 files at a time.",
    },
    media_invalid_file: {
        tone: "danger",
        title: "Upload failed",
        body: "None of the files were valid JPEG/PNG/WebP images under 15 MB.",
    },
    media_upload_failed: {
        tone: "danger",
        title: "Upload failed",
        body: "Could not save the pictures. Review logs and try again.",
    },
    media_delete_failed: {
        tone: "danger",
        title: "Delete failed",
        body: "Could not delete the picture. Review logs and try again.",
    },
};

type SettingsFormProps = {
    grow: GrowRecord;
    timelapseSettings: TimelapseSettings;
    saved?: string;
    archived?: string;
    media?: string;
    error?: string;
    saveAction: (formData: FormData) => Promise<void>;
    completeAction: (formData: FormData) => Promise<void>;
    uploadMediaAction: (formData: FormData) => Promise<void>;
    deleteMediaAction: (formData: FormData) => Promise<void>;
};

export function AdminSettingsForm({
    grow,
    timelapseSettings,
    saved,
    archived,
    media,
    error,
    saveAction,
    completeAction,
    uploadMediaAction,
    deleteMediaAction,
}: SettingsFormProps) {
    const mediaNotice = media ? MEDIA_NOTICES[media] : undefined;
    const mediaErrorNotice = error ? MEDIA_ERROR_NOTICES[error] : undefined;
    const today = new Date().toISOString().slice(0, 10);

    return (
        <div className="admin-theme min-h-screen bg-(--admin-bg) text-(--admin-text) lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="border-b border-(--admin-border) bg-(--admin-surface) lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
                <div className="border-b border-(--admin-border) px-4 py-4">
                    <Link href="/" className="flex items-center gap-3">
                        <Image
                            src="/growCastLogo_white.svg"
                            alt="GrowCast"
                            width={28}
                            height={28}
                            priority
                        />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-(--admin-text)">GrowCast</p>
                        </div>
                    </Link>
                </div>

                <div className="hidden space-y-6 px-3 py-4 lg:block">
                    <div>
                        <p className="px-3 text-xs font-medium text-(--admin-subtle)">Sections</p>
                        <nav className="mt-2 space-y-1">
                            {sectionLinks.map((item) => (
                                <NavLink key={item.href} href={item.href} label={item.label}/>
                            ))}
                        </nav>
                    </div>
                </div>
            </aside>

            <div className="min-w-0">
                <header className="sticky top-0 z-20 flex h-15.25 items-center justify-between border-b border-(--admin-border) bg-(--admin-bg) px-4 sm:px-6">
                    <div className="min-w-0">
                        <p className="text-xs text-(--admin-muted)">Control Panel</p>
                        <p className="truncate text-sm font-semibold text-(--admin-text)">Settings</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <form action="/admin/logout" method="post">
                            <AdminButton type="submit" tone="secondary">Sign Out</AdminButton>
                        </form>
                    </div>
                </header>

                <main className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                    <div className="space-y-6">
                        {saved ? (
                            <AdminNotice tone="success" title="Configuration saved">
                                Done.
                            </AdminNotice>
                        ) : null}

                        {archived ? (
                            <AdminNotice tone="success" title="Grow archived">
                                The grow was moved to the archive and the current grow was reset.{" "}
                                <Link href="/grows" className="underline" target="_blank">
                                    View past grows
                                </Link>
                            </AdminNotice>
                        ) : null}

                        {error === "save_failed" ? (
                            <AdminNotice tone="danger" title="Save failed">
                                Could not save all settings. Review logs and try again.
                            </AdminNotice>
                        ) : null}

                        {error === "archive_failed" ? (
                            <AdminNotice tone="danger" title="Archive failed">
                                Could not archive the grow. Review logs and try again — the current
                                grow was left untouched.
                            </AdminNotice>
                        ) : null}

                        {error === "archive_not_confirmed" ? (
                            <AdminNotice tone="warning" title="Archive not confirmed">
                                Tick the confirmation checkbox to complete and archive the grow.
                            </AdminNotice>
                        ) : null}

                        {mediaNotice ? (
                            <AdminNotice tone={mediaNotice.tone} title={mediaNotice.title}>
                                {mediaNotice.body}
                            </AdminNotice>
                        ) : null}

                        {mediaErrorNotice ? (
                            <AdminNotice tone={mediaErrorNotice.tone} title={mediaErrorNotice.title}>
                                {mediaErrorNotice.body}
                            </AdminNotice>
                        ) : null}

                        <form
                            id="admin-settings-form"
                            action={saveAction}
                            className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
                        >
                            <div className="space-y-6">
                                <AdminPanel id="general" title="General">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <AdminField label="Grow Name">
                                            <AdminInput name="name" defaultValue={grow.name} required/>
                                        </AdminField>
                                        <AdminField label="Plant">
                                            <AdminInput name="plant" defaultValue={grow.plant}/>
                                        </AdminField>
                                        <AdminField label="Plant Amount">
                                            <AdminInput
                                                name="plantAmount"
                                                type="number"
                                                min={0}
                                                defaultValue={grow.plantAmount}
                                            />
                                        </AdminField>
                                        <AdminField label="Strain">
                                            <AdminInput name="strain" defaultValue={grow.details.strain}/>
                                        </AdminField>
                                    </div>
                                    <div className="mt-4">
                                        <AdminCheckboxRow
                                            name="showSettingsLink"
                                            defaultChecked={grow.showSettingsLink}
                                            label="Show Settings link in the site header"
                                            description="When disabled, the link is hidden for all visitors. The admin area stays reachable at /admin."
                                        />
                                    </div>
                                </AdminPanel>

                                <AdminPanel id="lifecycle" title="Lifecycle">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <AdminField label="Stage">
                                            <AdminSelect name="stage" defaultValue={grow.details.stage}>
                                                <option value="Seed">Seed</option>
                                                <option value="Seedling">Seedling</option>
                                                <option value="Vegetative">Vegetative</option>
                                                <option value="Flowering">Flowering</option>
                                                <option value="Drying">Drying</option>
                                            </AdminSelect>
                                        </AdminField>
                                        <AdminField label="Date of Seeding">
                                            <AdminInput
                                                name="seededAt"
                                                type="date"
                                                defaultValue={grow.details.seededAt}
                                            />
                                        </AdminField>
                                        <AdminField label="Light Schedule">
                                            <AdminInput
                                                name="lightSchedule"
                                                defaultValue={grow.details.lightSchedule}
                                            />
                                        </AdminField>
                                    </div>
                                </AdminPanel>

                                <AdminPanel id="climate" title="Climate">
                                    <div className="grid gap-6 md:grid-cols-2">
                                        <div className="space-y-4">
                                            <p className="text-xs font-semibold uppercase text-(--admin-subtle)">
                                                Day
                                            </p>
                                            <AdminField label="Temperature (C)">
                                                <AdminInput
                                                    name="temperatureDay"
                                                    type="number"
                                                    min={0}
                                                    step="0.1"
                                                    defaultValue={grow.climate.temperatureDay}
                                                />
                                            </AdminField>
                                            <AdminField label="Humidity (%)">
                                                <AdminInput
                                                    name="humidityDay"
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    step="1"
                                                    defaultValue={grow.climate.humidityDay}
                                                />
                                            </AdminField>
                                        </div>
                                        <div className="space-y-4">
                                            <p className="text-xs font-semibold uppercase text-(--admin-subtle)">
                                                Night
                                            </p>
                                            <AdminField label="Temperature (C)">
                                                <AdminInput
                                                    name="temperatureNight"
                                                    type="number"
                                                    min={0}
                                                    step="0.1"
                                                    defaultValue={grow.climate.temperatureNight}
                                                />
                                            </AdminField>
                                            <AdminField label="Humidity (%)">
                                                <AdminInput
                                                    name="humidityNight"
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    step="1"
                                                    defaultValue={grow.climate.humidityNight}
                                                />
                                            </AdminField>
                                        </div>
                                    </div>
                                </AdminPanel>

                                <AdminPanel id="status" title="Status">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <AdminField label="Health">
                                            <AdminSelect name="health" defaultValue={grow.status.health}>
                                                <option value="Healthy">Healthy</option>
                                                <option value="Warning">Warning</option>
                                                <option value="Critical">Critical</option>
                                            </AdminSelect>
                                        </AdminField>
                                        <AdminField label="Estimated Harvest Date">
                                            <AdminInput
                                                name="estimatedHarvestDate"
                                                type="date"
                                                defaultValue={grow.status.estimatedHarvestDate}
                                                disabled
                                            />
                                        </AdminField>
                                    </div>
                                    <div className="mt-4">
                                        <AdminField label="Health Notes">
                                            <AdminTextarea
                                                name="statusNotes"
                                                defaultValue={grow.status.notes}
                                                rows={4}
                                            />
                                        </AdminField>
                                    </div>
                                </AdminPanel>

                                <AdminPanel id="notes" title="Notes">
                                    <AdminField label="Markdown supported">
                                        <AdminTextarea
                                            name="notes"
                                            defaultValue={grow.details.notes}
                                            rows={6}
                                        />
                                    </AdminField>
                                </AdminPanel>

                                <AdminPanel id="hardware" title="Hardware">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <AdminField label="Medium">
                                            <AdminInput
                                                name="growingMedium"
                                                defaultValue={grow.growSetup.growingMedium}
                                                placeholder="Soil, coco, hydro..."
                                            />
                                        </AdminField>
                                        <AdminField label="Pot Size (L)">
                                            <AdminInput
                                                name="potSizeLiters"
                                                type="number"
                                                min={0}
                                                defaultValue={grow.growSetup.potSizeLiters}
                                            />
                                        </AdminField>
                                    </div>
                                    <div className="mt-4">
                                        <AdminField label="Setup Description (MD-Supported)">
                                            <AdminTextarea
                                                name="setupText"
                                                defaultValue={grow.growSetup.setupText}
                                                rows={8}
                                                placeholder={"Tent: ...\nLight: ...\nFan: ..."}
                                            />
                                        </AdminField>
                                    </div>
                                </AdminPanel>

                                <AdminPanel id="stream" title="Stream">
                                    <div className="space-y-4">
                                        <AdminCheckboxRow
                                            name="showGrowName"
                                            defaultChecked={grow.showGrowName}
                                            label="Show grow name above stream"
                                            description="Displays the grow-name as header above the stream."
                                        />
                                        <AdminField label="Stream URL">
                                            <AdminInput
                                                name="streamUrl"
                                                defaultValue={grow.streamUrl}
                                                placeholder="https://..."
                                            />
                                        </AdminField>
                                    </div>
                                </AdminPanel>

                                <AdminPanel id="timelapse" title="Timelapse">
                                    <div className="space-y-4">
                                        <AdminCheckboxRow
                                            name="timelapsePaused"
                                            defaultChecked={timelapseSettings.paused}
                                            label="Pause timelapse"
                                            description="Stops the plugin from taking new snapshots until it is resumed."
                                        />
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <AdminField
                                                label="Timezone"
                                                hint="Use an IANA timezone such as UTC or Europe/Berlin."
                                            >
                                                <AdminInput
                                                    name="timelapseTimezone"
                                                    defaultValue={timelapseSettings.timezone}
                                                    placeholder="UTC"
                                                />
                                            </AdminField>
                                            <AdminField
                                                label="Interval (minutes)"
                                                hint="Leave empty to use trigger times only."
                                            >
                                                <AdminInput
                                                    name="timelapseInterval"
                                                    type="number"
                                                    min={1}
                                                    step={1}
                                                    defaultValue={timelapseSettings.intervalMinutes ?? ""}
                                                />
                                            </AdminField>
                                        </div>
                                        <div>
                                            <p className="mb-3 text-xs font-semibold uppercase text-(--admin-subtle)">
                                                Trigger Times
                                            </p>
                                            <div className="grid gap-4 md:grid-cols-3">
                                                <AdminField label="Time 1">
                                                    <AdminInput
                                                        name="timelapseTime1"
                                                        type="time"
                                                        lang="en-GB"
                                                        step={60}
                                                        defaultValue={timelapseSettings.time1}
                                                    />
                                                </AdminField>
                                                <AdminField label="Time 2">
                                                    <AdminInput
                                                        name="timelapseTime2"
                                                        type="time"
                                                        lang="en-GB"
                                                        step={60}
                                                        defaultValue={timelapseSettings.time2}
                                                    />
                                                </AdminField>
                                                <AdminField label="Time 3">
                                                    <AdminInput
                                                        name="timelapseTime3"
                                                        type="time"
                                                        lang="en-GB"
                                                        step={60}
                                                        defaultValue={timelapseSettings.time3}
                                                    />
                                                </AdminField>
                                            </div>
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <AdminField label="Timelapse Length (seconds)">
                                                <AdminInput
                                                    name="timelapseLength"
                                                    type="number"
                                                    min={1}
                                                    step={1}
                                                    defaultValue={timelapseSettings.timelapseLengthSeconds}
                                                />
                                            </AdminField>
                                            <AdminField label="Timelapse Quality">
                                                <AdminSelect
                                                    name="timelapseQuality"
                                                    defaultValue={timelapseSettings.timelapseQuality}
                                                >
                                                    <option value="low">Low</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="high">High</option>
                                                </AdminSelect>
                                            </AdminField>
                                        </div>
                                    </div>
                                </AdminPanel>

                                <AdminPanel id="socials" title="Socials">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <AdminField label="YouTube">
                                            <AdminInput
                                                name="youtube"
                                                defaultValue={grow.socials.youtube}
                                                placeholder="https://www.youtube.com/..."
                                            />
                                        </AdminField>
                                        <AdminField label="X (Formerly Twitter)">
                                            <AdminInput
                                                name="twitter"
                                                defaultValue={grow.socials.twitter}
                                                placeholder="https://www.x.com/..."
                                            />
                                        </AdminField>
                                        <AdminField label="Instagram">
                                            <AdminInput
                                                name="instagram"
                                                defaultValue={grow.socials.instagram}
                                                placeholder="https://www.instagram.com/..."
                                            />
                                        </AdminField>
                                        <AdminField label="GrowDiaries">
                                            <AdminInput
                                                name="growDiaries"
                                                defaultValue={grow.socials.growDiaries}
                                                placeholder="https://growdiaries.com/..."
                                            />
                                        </AdminField>
                                        <AdminField label="Discord Invite">
                                            <AdminInput
                                                name="discordInvite"
                                                defaultValue={grow.socials.discordInvite}
                                                placeholder="https://discord.gg/..."
                                            />
                                        </AdminField>
                                        <AdminField label="Custom URL">
                                            <AdminInput
                                                name="customWebsite"
                                                defaultValue={grow.socials.customWebsite}
                                                placeholder="https://growcast.0xmarcel.com/"
                                            />
                                        </AdminField>
                                    </div>
                                </AdminPanel>
                            </div>

                            <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
                                <AdminPanel
                                    title="Apply Changes"
                                    description="Changes will be live immediately."
                                >
                                    <div className="space-y-4">
                                        <AdminButton type="submit" tone="primary" className="w-full">
                                            Save Changes
                                        </AdminButton>
                                    </div>
                                </AdminPanel>

                                <AdminPanel
                                    title="Quick Links"
                                    description="Jump to the most important sites."
                                >
                                    <div className="grid gap-2">
                                        <Link
                                            href="/"
                                            target="_blank"
                                            className="rounded-xl border border-(--admin-border) bg-(--admin-bg) px-3 py-2 text-sm font-medium text-(--admin-text) transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                                        >
                                            Open Dashboard
                                        </Link>
                                        <Link
                                            href="/admin/archives"
                                            className="rounded-xl border border-(--admin-border) bg-(--admin-bg) px-3 py-2 text-sm font-medium text-(--admin-text) transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                                        >
                                            Manage Archives
                                        </Link>
                                        <Link
                                            href="https://growcast.0xmarcel.com/"
                                            target="_blank"
                                            className="rounded-xl border border-(--admin-border) bg-(--admin-bg) px-3 py-2 text-sm font-medium text-(--admin-text) transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                                        >
                                            GrowCast Website
                                        </Link>
                                        <Link
                                            href="https://github.com/zeroXmrcl/GrowCast"
                                            target="_blank"
                                            className="rounded-xl border border-(--admin-border) bg-(--admin-bg) px-3 py-2 text-sm font-medium text-(--admin-text) transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                                        >
                                            GitHub Repo
                                        </Link>
                                    </div>
                                </AdminPanel>
                            </div>
                        </form>

                        <MediaManager
                            uploadAction={uploadMediaAction}
                            deleteAction={deleteMediaAction}
                        />

                        <form action={completeAction}>
                            <AdminPanel
                                id="archive"
                                title="Complete Grow"
                                description="Finish this grow and move it to the public archive. This cannot be undone from the UI."
                                className="border-red-900/50"
                            >
                                <div className="space-y-4">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <AdminField label="Harvest Date">
                                            <AdminInput
                                                name="harvestedAt"
                                                type="date"
                                                defaultValue={today}
                                                required
                                            />
                                        </AdminField>
                                        <AdminField label="Yield (grams)" hint="Leave empty if not measured.">
                                            <AdminInput
                                                name="yieldGrams"
                                                type="number"
                                                min={0}
                                                step="0.1"
                                                placeholder="e.g. 120"
                                            />
                                        </AdminField>
                                    </div>
                                    <AdminField label="Final Notes" hint="How did it go? Shown on the archived grow page.">
                                        <AdminTextarea
                                            name="finalNotes"
                                            rows={4}
                                            placeholder="Harvest impressions, lessons learned..."
                                        />
                                    </AdminField>
                                    <AdminCheckboxRow
                                        name="confirmArchive"
                                        required
                                        label="I understand this moves all pictures into the archive"
                                        description="All snapshots, the timelapse and dashboard pictures move to the archive, and the grow details reset for the next run. Stream URL, socials and setup info are kept."
                                    />
                                    <AdminButton type="submit" tone="danger" className="w-full sm:w-auto">
                                        Complete &amp; Archive Grow
                                    </AdminButton>
                                </div>
                            </AdminPanel>
                        </form>
                    </div>
                </main>
            </div>
        </div>
    );
}
