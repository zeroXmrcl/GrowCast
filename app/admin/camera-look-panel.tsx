"use client";

import {useState} from "react";
import {AdminButton, AdminPanel} from "@/components/admin/ui";
import {
    CAMERA_LOOK_DRAFT_EVENT,
    CAMERA_LOOK_MAX,
    CAMERA_LOOK_MIN,
    EMPTY_CAMERA_LOOK,
    parseCameraLook,
    type CameraLook,
} from "@/lib/restream/camera-look";

function formatLookValue(value: number, temperature = false): string {
    if (value === 0) {
        return "0";
    }
    const signed = value > 0 ? `+${value}` : String(value);
    if (!temperature) {
        return signed;
    }
    return `${signed} ${value > 0 ? "warm" : "cool"}`;
}

function dispatchDraft(look: CameraLook): void {
    window.dispatchEvent(new CustomEvent(CAMERA_LOOK_DRAFT_EVENT, {detail: look}));
}

function Slider({
    name,
    label,
    value,
    temperature = false,
    onChange,
}: {
    name: keyof CameraLook;
    label: string;
    value: number;
    temperature?: boolean;
    onChange: (name: keyof CameraLook, value: number) => void;
}) {
    return (
        <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase text-(--admin-subtle)">{label}</p>
                <p className="text-sm tabular-nums text-(--admin-text)">
                    {formatLookValue(value, temperature)}
                </p>
            </div>
            <input
                type="range"
                name={name}
                min={CAMERA_LOOK_MIN}
                max={CAMERA_LOOK_MAX}
                step={1}
                value={value}
                onChange={(event) => onChange(name, Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-(--admin-border) accent-zinc-300"
            />
        </div>
    );
}

export function CameraLookPanel({look}: {look: CameraLook}) {
    const [current, setCurrent] = useState<CameraLook>(look);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    function update(name: keyof CameraLook, value: number): void {
        const next = parseCameraLook({...current, [name]: value});
        setCurrent(next);
        dispatchDraft(next);
    }

    async function persist(next: CameraLook): Promise<void> {
        setBusy(true);
        setNotice(null);
        try {
            const response = await fetch("/api/admin/camera-look", {
                method: "POST",
                credentials: "include",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(next),
            });
            const raw: unknown = await response.json().catch(() => null);
            const ok = raw !== null && typeof raw === "object" && "ok" in raw && raw.ok === true;
            if (!response.ok || !ok) {
                setNotice("Could not save the camera look.");
            }
        } catch {
            setNotice("Could not save the camera look.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <AdminPanel id="camera-look" title="Camera look">
            <div className="space-y-4">
                <p className="text-xs text-(--admin-subtle)">
                    Grades the live cam only. HUD stays true.
                </p>
                <Slider name="brightness" label="Brightness" value={current.brightness} onChange={update}/>
                <Slider name="contrast" label="Contrast" value={current.contrast} onChange={update}/>
                <Slider name="saturation" label="Saturation" value={current.saturation} onChange={update}/>
                <Slider
                    name="temperature"
                    label="Temperature"
                    value={current.temperature}
                    temperature
                    onChange={update}
                />
                {notice ? <p className="text-sm text-(--admin-muted)">{notice}</p> : null}
                <div className="flex gap-2">
                    <AdminButton
                        type="button"
                        tone="secondary"
                        disabled={busy}
                        onClick={() => {
                            setCurrent(EMPTY_CAMERA_LOOK);
                            dispatchDraft(EMPTY_CAMERA_LOOK);
                            void persist(EMPTY_CAMERA_LOOK);
                        }}
                    >
                        Reset
                    </AdminButton>
                    <AdminButton
                        type="button"
                        tone="primary"
                        disabled={busy}
                        onClick={() => {
                            void persist(current);
                        }}
                    >
                        Apply
                    </AdminButton>
                </div>
            </div>
        </AdminPanel>
    );
}
