"use client";

export function BroadcastToastSwitch({defaultChecked}: {defaultChecked: boolean}) {
    return (
        <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-(--admin-text)">Dashboard notification</span>
            <input
                type="checkbox"
                role="switch"
                name="toastEnabled"
                defaultChecked={defaultChecked}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
                className="h-4 w-4 rounded border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300"
            />
        </label>
    );
}
