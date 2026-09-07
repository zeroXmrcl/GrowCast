"use client";

import {useState} from "react";
import {
    WAVE_SMOOTH_MAX,
    WAVE_SMOOTH_MIN,
    WAVE_SMOOTH_STEP,
    parseWaveSmoothPct,
} from "@/lib/program-music-wave";

export default function WaveSmoothInput({defaultValue}: {defaultValue: number}) {
    const [value, setValue] = useState(parseWaveSmoothPct(defaultValue));
    return (
        <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase text-(--admin-subtle)">
                    Wave smoothness
                </p>
                <p className="text-sm tabular-nums text-(--admin-text)">{value}%</p>
            </div>
            <input
                type="range"
                name="waveSmoothPct"
                min={WAVE_SMOOTH_MIN}
                max={WAVE_SMOOTH_MAX}
                step={WAVE_SMOOTH_STEP}
                value={value}
                onChange={(event) => setValue(parseWaveSmoothPct(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-(--admin-border) accent-zinc-300"
            />
        </div>
    );
}
