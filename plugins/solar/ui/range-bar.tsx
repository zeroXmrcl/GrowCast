import type {SolarRangeId, SolarViewDto} from "./view-types";

const RANGES: Array<{id: SolarRangeId; label: string}> = [
    {id: "live", label: "Live"},
    {id: "24h", label: "24H"},
    {id: "7d", label: "7D"},
    {id: "30d", label: "30D"},
    {id: "grow", label: "This Grow"},
];

export function RangeBar({
    view,
    onChange,
}: {
    view: SolarViewDto;
    onChange: (range: SolarRangeId) => void;
}) {
    const growOff = !view.grow.active;
    return (
        <div className="gc-chips" role="tablist" aria-label="Time range">
            {RANGES.map((item) => {
                const disabled = item.id === "grow" && growOff;
                return (
                    <button
                        key={item.id}
                        type="button"
                        className={view.range === item.id ? "gc-chip on" : "gc-chip"}
                        disabled={disabled}
                        title={disabled ? (view.growDisabledHint ?? "No active grow") : item.label}
                        onClick={() => onChange(item.id)}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}
