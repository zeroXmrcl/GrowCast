"use client";

import {useEffect, useRef, useState, type ReactNode} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {adminNoticeContent} from "@/app/admin/admin-notice";
import {
    ADMIN_NOTICE_EVENT,
    type AdminToastDetail,
} from "@/lib/admin/publish-notice";
import {isAdminNoticeId} from "@/lib/admin/notice";
import type {Tone} from "@/components/admin/ui";

type ToastView = {
    title: string;
    body: ReactNode;
    tone: Tone;
};

const TONE_MARK: Record<Tone, string> = {
    success: "bg-emerald-950 text-emerald-300",
    warning: "bg-amber-950 text-amber-300",
    danger: "bg-red-950 text-red-300",
    neutral: "bg-zinc-800 text-zinc-200",
};

function viewFromDetail(detail: AdminToastDetail): ToastView | null {
    if (typeof detail === "string") {
        const content = adminNoticeContent(detail);
        if (!content) {
            return null;
        }
        return {title: content.title, body: content.body, tone: content.tone};
    }
    return detail;
}

function showToast(
    detail: AdminToastDetail,
    setView: (view: ToastView | null) => void,
    setTick: (update: (value: number) => number) => void,
): void {
    const next = viewFromDetail(detail);
    if (!next) {
        return;
    }
    setView(next);
    setTick((value) => value + 1);
}

export function AdminToast() {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();
    const [view, setView] = useState<ToastView | null>(null);
    const [tick, setTick] = useState(0);
    const seenNotice = useRef<string | null>(null);

    useEffect(() => {
        function onNotice(event: Event) {
            showToast((event as CustomEvent<AdminToastDetail>).detail, setView, setTick);
        }

        window.addEventListener(ADMIN_NOTICE_EVENT, onNotice);

        const notice = searchParams.get("notice");
        if (notice && isAdminNoticeId(notice)) {
            const key = `${pathname}?${searchParams.toString()}`;
            if (seenNotice.current !== key) {
                seenNotice.current = key;
                showToast(notice, setView, setTick);
                const next = new URLSearchParams(searchParams.toString());
                next.delete("notice");
                const query = next.toString();
                router.replace(query ? `${pathname}?${query}` : pathname, {scroll: false});
            }
        }

        return () => window.removeEventListener(ADMIN_NOTICE_EVENT, onNotice);
    }, [pathname, router, searchParams]);

    useEffect(() => {
        if (!view) {
            return;
        }
        const timer = window.setTimeout(() => setView(null), 4000);
        return () => window.clearTimeout(timer);
    }, [view, tick]);

    if (!view) {
        return null;
    }

    return (
        <div className="admin-theme admin-toast" role="status">
            <span className={`admin-toast-mark ${TONE_MARK[view.tone]}`} aria-hidden="true"/>
            <div>
                <p className="text-sm font-semibold text-(--admin-text)">{view.title}</p>
                {view.body ? <div className="mt-0.5 text-sm text-(--admin-muted)">{view.body}</div> : null}
            </div>
            <span key={tick} className="admin-toast-timer"/>
        </div>
    );
}
