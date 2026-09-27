"use client";

import {useRouter} from "next/navigation";
import {useState, type FormEvent, type ReactNode} from "react";
import {adminNoticeRefreshes} from "@/lib/admin/action-result";
import {isAdminNoticeId} from "@/lib/admin/notice";
import {publishAdminNotice} from "@/lib/admin/publish-notice";

export function AdminFetchForm({
    endpoint,
    children,
    className,
}: {
    endpoint: string;
    children: ReactNode;
    className?: string;
}) {
    const router = useRouter();
    const [pending, setPending] = useState(false);

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        setPending(true);
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                body: new FormData(form),
                credentials: "include",
            });
            const type = response.headers.get("content-type") ?? "";
            if (type.includes("application/json")) {
                const payload: unknown = await response.json().catch(() => null);
                const notice = payload !== null
                    && typeof payload === "object"
                    && "notice" in payload
                    && typeof payload.notice === "string"
                    ? payload.notice
                    : "";
                if (isAdminNoticeId(notice)) {
                    publishAdminNotice(notice);
                    if (response.ok && adminNoticeRefreshes(notice)) {
                        form.reset();
                        router.refresh();
                    }
                }
                return;
            }
            if (response.redirected) {
                window.location.assign(response.url);
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
