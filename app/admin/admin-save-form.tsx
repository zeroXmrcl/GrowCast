"use client";

import {useRouter} from "next/navigation";
import {useEffect, useId, useRef, useState, type FormEvent, type ReactNode} from "react";
import {adminNoticeRefreshes, type AdminActionResult} from "@/lib/admin/action-result";
import {publishAdminNotice} from "@/lib/admin/publish-notice";

type AdminAction = (formData: FormData) => Promise<AdminActionResult>;

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

function setSaveBarVisible(visible: boolean): void {
    if (visible) {
        document.documentElement.dataset.adminSaveBar = "1";
    } else if (document.documentElement.dataset.adminSaveBar) {
        delete document.documentElement.dataset.adminSaveBar;
    }
}

export function AdminSaveForm({
    action,
    children,
    className,
}: {
    action: AdminAction;
    children: ReactNode;
    className?: string;
}) {
    const router = useRouter();
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

    useEffect(() => {
        setSaveBarVisible(dirty);
        return () => setSaveBarVisible(false);
    }, [dirty]);

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
            const result = await action(new FormData(form));
            publishAdminNotice(result.notice);
            if (adminNoticeRefreshes(result.notice)) {
                baseline.current = formSnapshot(form);
                setDirty(false);
                router.refresh();
            }
        } finally {
            setPending(false);
        }
    }

    function discard() {
        formRef.current?.reset();
        setDirty(false);
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
                    <button type="button" className="admin-savebar-discard" onClick={discard}>
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

export function AdminImmediateForm({
    action,
    children,
    className,
}: {
    action: AdminAction;
    children: ReactNode;
    className?: string;
}) {
    const router = useRouter();
    const [pending, setPending] = useState(false);

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        try {
            const result = await action(new FormData(event.currentTarget));
            publishAdminNotice(result.notice);
            if (adminNoticeRefreshes(result.notice)) {
                router.refresh();
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
