"use client";

import {useState} from "react";
import {
    OVERLAY_SCALE_MAX,
    OVERLAY_SCALE_MIN,
    OVERLAY_SCALE_STEP,
    parseOverlayScalePct,
} from "@/lib/overlay-scale";

export default function OverlayScaleInput({defaultValue}: {defaultValue: number}) {
    const [value, setValue] = useState(parseOverlayScalePct(defaultValue));

    return (
        <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase text-(--admin-subtle)">HUD scale</p>
                <p className="text-sm tabular-nums text-(--admin-text)">{value}%</p>
            </div>
            <input
                type="range"
                name="overlayScalePct"
                min={OVERLAY_SCALE_MIN}
                max={OVERLAY_SCALE_MAX}
                step={OVERLAY_SCALE_STEP}
                value={value}
                onChange={(event) => setValue(parseOverlayScalePct(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-(--admin-border) accent-zinc-300"
            />
            <p className="mt-2 text-xs text-(--admin-muted)">
                Shrinks or grows the HUD. Browser Source stays 1920×1080.
            </p>
        </div>
    );
}
