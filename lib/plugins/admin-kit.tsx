"use client";

import {usePluginLive} from "@growcast/plugin-sdk/ui";
import {
    useEffect,
    useId,
    useRef,
    useState,
    type ButtonHTMLAttributes,
    type ComponentPropsWithoutRef,
    type FormEvent,
    type ReactNode,
} from "react";
import {publishAdminNotice} from "@/lib/admin/publish-notice";

type ButtonTone = "primary" | "secondary" | "danger";

const controlClassName =
    "h-10 w-full rounded-md border border-(--admin-border-strong) bg-(--admin-surface) px-3 text-sm text-(--admin-text) outline-none placeholder:text-(--admin-subtle) focus:border-zinc-500 focus:bg-(--admin-surface-muted) disabled:cursor-not-allowed disabled:border-(--admin-border) disabled:bg-[#1d1d1d] disabled:text-(--admin-subtle)";

function joinClasses(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(" ");
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

export function AdminBandGroup({children}: {children: ReactNode}) {
    return <div className="admin-band-group">{children}</div>;
}

export function AdminBand({
    id,
    title,
    children,
    plain = false,
}: {
    id?: string;
    title: string;
    children: ReactNode;
    plain?: boolean;
}) {
    return (
        <section id={id} className={plain ? "admin-band admin-band-plain" : "admin-band"}>
            <h2 className="text-base font-semibold text-(--admin-text)">{title}</h2>
            <div className="min-w-0">{children}</div>
        </section>
    );
}

export function AdminField({label, hint, children}: {label: string; hint?: string; children: ReactNode}) {
    return (
        <label className="block">
            <span className="mb-2 block text-xs font-medium text-(--admin-muted)">{label}</span>
            {children}
            {hint ? <span className="mt-2 block text-xs text-(--admin-subtle)">{hint}</span> : null}
        </label>
    );
}

export function AdminInput({className, ...props}: ComponentPropsWithoutRef<"input">) {
    return <input {...props} className={joinClasses(controlClassName, className)} />;
}

export function AdminSelect({className, children, ...props}: ComponentPropsWithoutRef<"select">) {
    return (
        <select {...props} className={joinClasses(controlClassName, "appearance-none", className)}>
            {children}
        </select>
    );
}

export function AdminCheckboxRow({
    label,
    description,
    className,
    ...props
}: ComponentPropsWithoutRef<"input"> & {label: string; description?: string}) {
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

export function AdminOptionalTimeInput({
    name,
    defaultValue,
}: {
    name: string;
    defaultValue: string;
}) {
    const [value, setValue] = useState(defaultValue);
    return (
        <div className="flex items-center gap-2">
            <AdminInput
                name={name}
                type="time"
                value={value}
                onChange={(event) => setValue(event.currentTarget.value)}
            />
            {value ? (
                <AdminButton type="button" onClick={() => setValue("")}>
                    Clear
                </AdminButton>
            ) : null}
        </div>
    );
}

function noticeFromPayload(payload: unknown): string {
    if (payload !== null && typeof payload === "object" && "notice" in payload && typeof payload.notice === "string") {
        return payload.notice;
    }
    return "";
}

function pluginActionUrl(pluginId: string, actionPath: string): string {
    return `/api/plugins/v1/${encodeURIComponent(pluginId)}/x/${actionPath.replace(/^\/+/, "")}`;
}

export function PluginImmediateForm({
    actionPath,
    pluginId,
    children,
    className,
    onSaved,
}: {
    actionPath: string;
    pluginId?: string;
    children: ReactNode;
    className?: string;
    onSaved?: () => void;
}) {
    const live = usePluginLive();
    const id = pluginId ?? live.pluginId;
    const [pending, setPending] = useState(false);

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        try {
            const response = await fetch(pluginActionUrl(id, actionPath), {
                method: "POST",
                body: new FormData(event.currentTarget),
                credentials: "include",
            });
            const notice = noticeFromPayload(await response.json().catch(() => null));
            if (notice) {
                publishAdminNotice(notice);
            }
            if (response.ok) {
                onSaved?.();
            }
        } finally {
            setPending(false);
        }
    }

    return (
        <form className={className} onSubmit={onSubmit} data-pending={pending ? "1" : "0"}>
            {children}
        </form>
    );
}

function formSnapshot(form: HTMLFormElement): string {
    const parts: string[] = [];
    for (const [key, value] of new FormData(form).entries()) {
        if (value instanceof File) {
            parts.push(`${key}:${value.name}:${value.size}`);
        } else {
            parts.push(`${key}=${value}`);
        }
    }
    return parts.join("\n");
}

export function PluginSaveForm({
    actionPath,
    pluginId,
    children,
    className,
    onSaved,
}: {
    actionPath: string;
    pluginId?: string;
    children: ReactNode;
    className?: string;
    onSaved?: () => void;
}) {
    const live = usePluginLive();
    const id = pluginId ?? live.pluginId;
    const formRef = useRef<HTMLFormElement>(null);
    const baseline = useRef("");
    const [dirty, setDirty] = useState(false);
    const [pending, setPending] = useState(false);
    const barLabel = useId();

    useEffect(() => {
        if (formRef.current) {
            baseline.current = formSnapshot(formRef.current);
        }
    }, []);

    function syncDirty() {
        const form = formRef.current;
        if (!form) {
            return;
        }
        setDirty(formSnapshot(form) !== baseline.current);
    }

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = formRef.current;
        if (!form) {
            return;
        }
        setPending(true);
        try {
            const response = await fetch(pluginActionUrl(id, actionPath), {
                method: "POST",
                body: new FormData(form),
                credentials: "include",
            });
            const notice = noticeFromPayload(await response.json().catch(() => null));
            if (notice) {
                publishAdminNotice(notice);
            }
            if (response.ok) {
                baseline.current = formSnapshot(form);
                setDirty(false);
                onSaved?.();
            }
        } finally {
            setPending(false);
        }
    }

    return (
        <form
            ref={formRef}
            className={className ? `admin-save-form ${className}` : "admin-save-form"}
            onInput={syncDirty}
            onChange={syncDirty}
            onSubmit={onSubmit}
        >
            {children}
            {dirty ? (
                <div className="admin-savebar" role="region" aria-labelledby={barLabel}>
                    <p id={barLabel} className="m-0 flex-1 text-sm text-(--admin-muted)">Unsaved changes</p>
                    <button
                        type="button"
                        className="admin-savebar-discard"
                        onClick={() => {
                            formRef.current?.reset();
                            setDirty(false);
                        }}
                    >
                        Discard
                    </button>
                    <button type="submit" className="admin-savebar-save" disabled={pending}>
                        {pending ? "Saving…" : "Save changes"}
                    </button>
                </div>
            ) : null}
        </form>
    );
}

export function PluginFetchForm({
    endpoint,
    children,
    className,
    onSaved,
}: {
    endpoint: string;
    children: ReactNode;
    className?: string;
    onSaved?: () => void;
}) {
    const [pending, setPending] = useState(false);

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                body: new FormData(event.currentTarget),
                credentials: "include",
            });
            const notice = noticeFromPayload(await response.json().catch(() => null));
            if (notice) {
                publishAdminNotice(notice);
            }
            if (response.ok) {
                onSaved?.();
            }
        } finally {
            setPending(false);
        }
    }

    return (
        <form className={className} onSubmit={onSubmit} data-pending={pending ? "1" : "0"}>
            {children}
        </form>
    );
}

export function usePluginAdminState<T>(actionPath: string, pluginId?: string): {
    data: T | null;
    reload: () => void;
} {
    const live = usePluginLive();
    const id = pluginId ?? live.pluginId;
    const [data, setData] = useState<T | null>(null);

    const reload = () => {
        void fetch(pluginActionUrl(id, actionPath), {credentials: "include", cache: "no-store"})
            .then((response) => (response.ok ? response.json() : null))
            .then((raw) => {
                if (raw) {
                    setData(raw as T);
                }
            })
            .catch(() => undefined);
    };

    useEffect(() => {
        reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when plugin/path change
    }, [id, actionPath]);

    return {data, reload};
}
