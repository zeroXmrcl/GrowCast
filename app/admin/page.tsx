import {revalidatePath} from "next/cache";
import {headers} from "next/headers";
import Image from "next/image";
import Link from "next/link";
import {redirect} from "next/navigation";
import type {ButtonHTMLAttributes, ComponentPropsWithoutRef, ReactNode} from "react";
import {
    getAdminAuthStatus,
    isAdminAuthenticated,
    loginAdmin,
    requireAdmin,
} from "@/lib/admin-auth";
import {getCurrentGrow, updateCurrentGrow} from "@/lib/db";

type AdminPageProps = {
    searchParams: Promise<{
        error?: string;
        saved?: string;
        retry?: string;
    }>;
};

type Tone = "neutral" | "success" | "warning" | "danger";
type ButtonTone = "primary" | "secondary" | "danger";

type AdminPanelProps = {
    id?: string;
    title: string;
    description?: string;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
};

type AdminFieldProps = {
    label: string;
    hint?: string;
    children: ReactNode;
};

type AdminNoticeProps = {
    tone?: Tone;
    title?: string;
    children: ReactNode;
};

type AdminCheckboxRowProps = ComponentPropsWithoutRef<"input"> & {
    label: string;
    description?: string;
};

const sectionLinks = [
    {href: "#general", label: "General"},
    {href: "#lifecycle", label: "Lifecycle"},
    {href: "#stream", label: "Stream"},
    {href: "#status", label: "Status"},
    {href: "#hardware", label: "Hardware"},
    {href: "#notes", label: "Notes"},
    {href: "#otherSettings", label: "Other"},
];

const controlClassName =
    "h-10 w-full rounded-md border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 text-sm text-[var(--admin-text)] outline-none placeholder:text-[var(--admin-subtle)] focus:border-zinc-500 focus:bg-[var(--admin-surface-muted)] disabled:cursor-not-allowed disabled:border-[var(--admin-border)] disabled:bg-[#1d1d1d] disabled:text-[var(--admin-subtle)]";

function joinClasses(...classes: Array<string | undefined>): string {
    return classes.filter(Boolean).join(" ");
}

function getToneClasses(tone: Tone): string {
    switch (tone) {
        case "success":
            return "border-emerald-900/70 bg-emerald-950/20 text-emerald-300";
        case "warning":
            return "border-amber-900/70 bg-amber-950/20 text-amber-300";
        case "danger":
            return "border-red-900/70 bg-red-950/20 text-red-300";
        default:
            return "border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text)]";
    }
}

function getButtonToneClasses(tone: ButtonTone): string {
    switch (tone) {
        case "primary":
            return "border-zinc-500 bg-zinc-200 text-zinc-950 hover:bg-white";
        case "danger":
            return "border-red-800 bg-red-900/50 text-red-100 hover:bg-red-900/70";
        default:
            return "border-[var(--admin-border-strong)] bg-[var(--admin-surface)] text-[var(--admin-text)] hover:border-zinc-500 hover:bg-[var(--admin-surface-muted)]";
    }
}

function NavLink({href, label}: {href: string; label: string}) {
    return (
        <Link
            href={href}
            className="block rounded-md border border-transparent px-3 py-2 text-sm text-(--admin-muted) hover:border-(--admin-border) hover:bg-(--admin-surface-muted) hover:text-(--admin-text)"
        >
            {label}
        </Link>
    );
}

function AdminPanel({id, title, description, actions, children, className}: AdminPanelProps) {
    return (
        <section
            id={id}
            className={joinClasses(
                "scroll-mt-20 overflow-hidden rounded-md border border-(--admin-border) bg-(--admin-surface-muted)",
                className,
            )}
        >
            <div className="flex flex-col gap-3 border-b border-(--admin-border) px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-(--admin-text)">{title}</h2>
                    {description ? (
                        <p className="mt-1 text-sm text-(--admin-muted)">{description}</p>
                    ) : null}
                </div>
                {actions ? <div className="shrink-0">{actions}</div> : null}
            </div>
            <div className="px-4 py-4">{children}</div>
        </section>
    );
}

function AdminField({label, hint, children}: AdminFieldProps) {
    return (
        <label className="block">
            <span className="mb-2 block text-xs font-medium text-(--admin-muted)">{label}</span>
            {children}
            {hint ? <span className="mt-2 block text-xs text-(--admin-subtle)">{hint}</span> : null}
        </label>
    );
}

function AdminInput({className, ...props}: ComponentPropsWithoutRef<"input">) {
    return <input {...props} className={joinClasses(controlClassName, className)}/>;
}

function AdminTextarea({className, ...props}: ComponentPropsWithoutRef<"textarea">) {
    return (
        <textarea
            {...props}
            className={joinClasses(
                "min-h-30 w-full rounded-md border border-(--admin-border-strong) bg-(--admin-surface) px-3 py-2 text-sm text-(--admin-text) outline-none placeholder:text-(--admin-subtle) focus:border-zinc-500 focus:bg-(--admin-surface-muted) disabled:cursor-not-allowed disabled:border-(--admin-border) disabled:bg-[#1d1d1d] disabled:text-(--admin-subtle)",
                className,
            )}
        />
    );
}

function AdminSelect({className, children, ...props}: ComponentPropsWithoutRef<"select">) {
    return (
        <select
            {...props}
            className={joinClasses(controlClassName, "appearance-none", className)}
        >
            {children}
        </select>
    );
}

function AdminCheckboxRow({label, description, className, ...props}: AdminCheckboxRowProps) {
    return (
        <label className="flex items-start gap-3 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3">
            <input
                {...props}
                type="checkbox"
                className={joinClasses(
                    "mt-0.5 h-4 w-4 rounded border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300",
                    className,
                )}
            />
            <span className="min-w-0">
                <span className="block text-sm font-medium text-(--admin-text)">{label}</span>
                {description ? <span className="mt-1 block text-xs text-(--admin-muted)">{description}</span> : null}
            </span>
        </label>
    );
}

function AdminButton({className, tone = "secondary", type = "button", ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: ButtonTone;
}) {
    return (
        <button
            {...props}
            type={type}
            className={joinClasses(
                "inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:border-(--admin-border) disabled:bg-[#1d1d1d] disabled:text-(--admin-subtle)",
                getButtonToneClasses(tone),
                className,
            )}
        />
    );
}

function AdminNotice({tone = "neutral", title, children}: AdminNoticeProps) {
    return (
        <div className={joinClasses("rounded-md border px-4 py-3", getToneClasses(tone))}>
            {title ? <p className="text-sm font-semibold">{title}</p> : null}
            <div className={joinClasses("text-sm", title ? "mt-1" : undefined)}>{children}</div>
        </div>
    );
}

async function getRequestIp(): Promise<string> {
    const h = await headers();

    const cfIp = h.get("cf-connecting-ip");
    if (cfIp) {
        return cfIp;
    }

    const xff = h.get("x-forwarded-for");
    if (xff) {
        const first = xff.split(",")[0]?.trim();
        if (first) {
            return first;
        }
    }

    const realIp = h.get("x-real-ip");
    if (realIp) {
        return realIp;
    }

    return "unknown";
}

function toNumber(value: FormDataEntryValue | null, fallback = 0): number {
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function AdminPage({searchParams}: AdminPageProps) {
    const params = await searchParams;
    const isLoggedIn = await isAdminAuthenticated();
    const adminStatus = getAdminAuthStatus();

    async function loginAction(formData: FormData) {
        "use server";

        const ip = await getRequestIp();
        const clientKey = `admin-login:${ip}`;

        const username = String(formData.get("username") ?? "");
        const password = String(formData.get("password") ?? "");

        const result = await loginAdmin(username, password, clientKey);

        if (!result.ok) {
            if (result.code === "rate_limited") {
                redirect(`/admin?error=rate_limited&retry=${result.retryAfterSeconds ?? 900}`);
            }

            if (result.code === "login_disabled") {
                redirect("/admin?error=login_disabled");
            }

            redirect("/admin?error=invalid_credentials");
        }

        redirect("/admin");
    }

    async function saveGrowAction(formData: FormData) {
        "use server";

        await requireAdmin();

        const seededAt = String(formData.get("seededAt") ?? "");

        await updateCurrentGrow({
            name: String(formData.get("name") ?? ""),
            showGrowName: formData.get("showGrowName") === "on",
            plant: String(formData.get("plant") ?? ""),
            plantAmount: toNumber(formData.get("plantAmount"), 0),
            streamUrl: String(formData.get("streamUrl") ?? ""),
            details: {
                strain: String(formData.get("strain") ?? ""),
                stage: String(formData.get("stage") ?? ""),
                seededAt,
                lightSchedule: String(formData.get("lightSchedule") ?? ""),
                notes: String(formData.get("notes") ?? ""),
            },
            growSetup: {
                setupText: String(formData.get("setupText") ?? ""),
                growingMedium: String(formData.get("growingMedium") ?? ""),
                potSizeLiters: toNumber(formData.get("potSizeLiters"), 0),
            },
            status: {
                health: String(formData.get("health") ?? "Healthy"),
                estimatedHarvestDate: String(formData.get("estimatedHarvestDate") ?? ""),
                notes: String(formData.get("statusNotes") ?? ""),
            },
            otherSettings: {
                youtube: String(formData.get("youtube") ?? ""),
                twitter: String(formData.get("twitter") ?? ""),
                instagram: String(formData.get("instagram") ?? ""),
                discordInvite: String(formData.get("discordInvite") ?? ""),
                growDiaries: String(formData.get("growDiaries") ?? ""),
                customWebsite: String(formData.get("customWebsite") ?? ""),
            }
        });

        revalidatePath("/");
        revalidatePath("/admin");
        redirect("/admin?saved=1");
    }

    if (!isLoggedIn) {
        return (
            <div className="admin-theme min-h-screen bg-(--admin-bg) text-(--admin-text)">
                <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
                    <div className="w-full space-y-4">
                        <AdminPanel title="Sign In">
                            <div className="space-y-4">
                                {params.error === "invalid_credentials" ? (
                                    <AdminNotice tone="danger" title="Authentication failed">
                                        Invalid username or password.
                                    </AdminNotice>
                                ) : null}

                                {params.error === "rate_limited" ? (
                                    <AdminNotice tone="danger" title="Sign in temporarily blocked">
                                        Too many failed attempts. Try again later.
                                    </AdminNotice>
                                ) : null}

                                {params.error === "login_disabled" ? (
                                    <AdminNotice tone="warning" title="Login unavailable">
                                        Admin login is disabled because the required configuration is incomplete.
                                    </AdminNotice>
                                ) : null}

                                {params.error === "unauthorized" ? (
                                    <AdminNotice tone="danger" title="Authentication required">
                                        You must sign in before accessing the control panel.
                                    </AdminNotice>
                                ) : null}

                                {!adminStatus.canLogin ? (
                                    <AdminNotice tone="warning" title="Configuration issues">
                                        <ul className="space-y-1">
                                            {adminStatus.warnings.map((warning) => (
                                                <li key={warning}>{warning}</li>
                                            ))}
                                        </ul>
                                    </AdminNotice>
                                ) : null}

                                <form action={loginAction} className="space-y-4">
                                    <AdminField label="Username">
                                        <AdminInput
                                            name="username"
                                            placeholder="Username"
                                            type="text"
                                            required
                                            disabled={!adminStatus.canLogin}
                                            autoComplete="username"
                                        />
                                    </AdminField>

                                    <AdminField label="Password">
                                        <AdminInput
                                            name="password"
                                            type="password"
                                            placeholder="Password"
                                            required
                                            disabled={!adminStatus.canLogin}
                                            autoComplete="current-password"
                                        />
                                    </AdminField>

                                    <AdminButton
                                        type="submit"
                                        tone="primary"
                                        disabled={!adminStatus.canLogin}
                                        className="w-full"
                                    >
                                        Sign In
                                    </AdminButton>
                                </form>
                            </div>
                        </AdminPanel>
                    </div>
                </main>
            </div>
        );
    }

    const grow = await getCurrentGrow();

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
                        {params.saved ? (
                            <AdminNotice tone="success" title="Configuration saved">
                                Done.
                            </AdminNotice>
                        ) : null}

                        <form
                            id="admin-settings-form"
                            action={saveGrowAction}
                            className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
                        >
                            <div className="space-y-6">
                                <AdminPanel id="general" title="General">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <AdminField label="Grow Name">
                                            <AdminInput
                                                name="name"
                                                defaultValue={grow.name}
                                                required
                                            />
                                        </AdminField>

                                        <AdminField label="Plant">
                                            <AdminInput
                                                name="plant"
                                                defaultValue={grow.plant}
                                            />
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
                                            <AdminInput
                                                name="strain"
                                                defaultValue={grow.details.strain}
                                            />
                                        </AdminField>
                                    </div>
                                </AdminPanel>

                                <AdminPanel id="lifecycle" title="Lifecycle">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <AdminField label="Stage">
                                            <AdminSelect
                                                name="stage"
                                                defaultValue={grow.details.stage}
                                            >
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

                                <AdminPanel id="status" title="Status">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <AdminField label="Health">
                                            <AdminSelect
                                                name="health"
                                                defaultValue={grow.status.health}
                                            >
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

                                <AdminPanel id="notes" title="Notes">
                                    <AdminField label="Markdown supported">
                                        <AdminTextarea
                                            name="notes"
                                            defaultValue={grow.details.notes}
                                            rows={6}
                                        />
                                    </AdminField>
                                </AdminPanel>

                                <AdminPanel id="otherSettings" title="Other Settings">
                                    <AdminField label="YouTube">
                                        <AdminInput
                                            name="youtube"
                                            defaultValue={grow.otherSettings.youtube}
                                            placeholder="https://www.youtube.com/..."
                                        />
                                    </AdminField>

                                    <AdminField label="X (Formerly Twitter)">
                                        <AdminInput
                                            name="twitter"
                                            defaultValue={grow.otherSettings.twitter}
                                            placeholder="https://www.x.com/..."
                                        />
                                    </AdminField>
                                    <AdminField label="Instagram">
                                        <AdminInput
                                            name="instagram"
                                            defaultValue={grow.otherSettings.instagram}
                                            placeholder="https://www.instagram.com/..."
                                        />
                                    </AdminField>
                                    <AdminField label="GrowDiaries">
                                        <AdminInput
                                            name="growDiaries"
                                            defaultValue={grow.otherSettings.growDiaries}
                                            placeholder="https://growdiaries.com/..."
                                        />
                                    </AdminField>
                                    <AdminField label="Discord Invite">
                                        <AdminInput
                                            name="discordInvite"
                                            defaultValue={grow.otherSettings.discordInvite}
                                            placeholder="https://www.youtube.com/..."
                                        />
                                    </AdminField>
                                    <AdminField label="Custom URL">
                                        <AdminInput
                                            name="customWebsite"
                                            defaultValue={grow.otherSettings.customWebsite}
                                            placeholder="https://growcast.0xmarcel.com/"
                                        />
                                    </AdminField>
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
                    </div>
                </main>
            </div>
        </div>
    );
}