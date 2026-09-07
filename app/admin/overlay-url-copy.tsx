"use client";

import {AdminButton, AdminInput} from "@/components/admin/ui";

export function OverlayUrlCopy({url}: {url: string}) {
    async function onCopy() {
        const field = document.getElementById("broadcast-overlay-url");
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            if (field instanceof HTMLInputElement) {
                field.focus();
                field.select();
            }
        }
    }

    return (
        <div className="flex gap-2">
            <AdminInput id="broadcast-overlay-url" readOnly value={url}/>
            <AdminButton type="button" tone="secondary" onClick={() => void onCopy()}>
                Copy
            </AdminButton>
        </div>
    );
}
