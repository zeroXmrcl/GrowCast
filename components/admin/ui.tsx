import type {ButtonHTMLAttributes, ComponentPropsWithoutRef, ReactNode} from "react";
import Link from "next/link";

export type Tone = "neutral" | "success" | "warning" | "danger";
export type ButtonTone = "primary" | "secondary" | "danger";

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

export function NavLink({href, label}: {href: string; label: string}) {
    return (
        <Link
            href={href}
            className="block rounded-md border border-transparent px-3 py-2 text-sm text-(--admin-muted) hover:border-(--admin-border) hover:bg-(--admin-surface-muted) hover:text-(--admin-text)"
        >
            {label}
        </Link>
    );
}

export function AdminPanel({id, title, description, actions, children, className}: AdminPanelProps) {
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

export function AdminField({label, hint, children}: AdminFieldProps) {
    return (
        <label className="block">
            <span className="mb-2 block text-xs font-medium text-(--admin-muted)">{label}</span>
            {children}
            {hint ? <span className="mt-2 block text-xs text-(--admin-subtle)">{hint}</span> : null}
        </label>
    );
}

export function AdminInput({className, ...props}: ComponentPropsWithoutRef<"input">) {
    return <input {...props} className={joinClasses(controlClassName, className)}/>;
}

export function AdminTextarea({className, ...props}: ComponentPropsWithoutRef<"textarea">) {
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

export function AdminSelect({className, children, ...props}: ComponentPropsWithoutRef<"select">) {
    return (
        <select
            {...props}
            className={joinClasses(controlClassName, "appearance-none", className)}
        >
            {children}
        </select>
    );
}

export function AdminCheckboxRow({label, description, className, ...props}: AdminCheckboxRowProps) {
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

export function AdminButton({
    className,
    tone = "secondary",
    type = "button",
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {tone?: ButtonTone}) {
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

export function AdminNotice({tone = "neutral", title, children}: AdminNoticeProps) {
    return (
        <div className={joinClasses("rounded-md border px-4 py-3", getToneClasses(tone))}>
            {title ? <p className="text-sm font-semibold">{title}</p> : null}
            <div className={joinClasses("text-sm", title ? "mt-1" : undefined)}>{children}</div>
        </div>
    );
}
