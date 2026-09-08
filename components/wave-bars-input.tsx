"use client";

import {useState} from "react";
import {
    WAVE_BARS_MAX,
    WAVE_BARS_MIN,
    WAVE_BARS_STEP,
    parseWaveBars,
} from "@/lib/program-music-wave";

export default function WaveBarsInput({defaultValue}: {defaultValue: number}) {
    const [value, setValue] = useState(parseWaveBars(defaultValue));
    return (
        <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase text-(--admin-subtle)">
                    Bars
                </p>
                <p className="text-sm tabular-nums text-(--admin-text)">{value}</p>
            </div>
            <input
                type="range"
                name="waveBars"
                min={WAVE_BARS_MIN}
                max={WAVE_BARS_MAX}
                step={WAVE_BARS_STEP}
                value={value}
                onChange={(event) => setValue(parseWaveBars(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-(--admin-border) accent-zinc-300"
            />
        </div>
    );
}
