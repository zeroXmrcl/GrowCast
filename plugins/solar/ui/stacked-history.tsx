import type {SolarBucket, SolarViewDto} from "./view-types";

const H = 260;
const LEFT = 36;
const RIGHT = 36;
const TOP = 12;
const BOTTOM = 28;

function finite(value: number | null | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function polylineSegments(points: Array<{x: number; y: number | null}>): string[] {
    const lines: string[] = [];
    let current: string[] = [];
    for (const point of points) {
        if (point.y === null) {
            if (current.length > 0) {
                lines.push(current.join(" "));
                current = [];
            }
            continue;
        }
        current.push(`${point.x},${point.y}`);
    }
    if (current.length > 0) {
        lines.push(current.join(" "));
    }
    return lines;
}

function stackParts(bucket: SolarBucket): Array<{key: string; color: string; value: number}> {
    const parts = [
        {key: "tent-pv", color: "var(--gc-solar)", value: bucket.tentFromPvW ?? 0},
        {key: "tent-batt", color: "var(--gc-battery)", value: bucket.tentFromBatteryW ?? 0},
        {key: "house-solar", color: "#86efac", value: bucket.houseOtherFromSolarW ?? 0},
        {key: "tent-grid", color: "var(--gc-grid)", value: bucket.tentFromGridW ?? 0},
        {key: "house-grid", color: "#38bdf8", value: bucket.houseOtherFromGridW ?? 0},
    ];
    return parts.filter((part) => part.value > 0);
}

export function StackedHistory({view}: {view: SolarViewDto}) {
    const buckets = view.buckets;
    const max = Math.max(
        1,
        ...buckets.map((bucket) => {
            const stack = (bucket.tentFromPvW ?? 0) + (bucket.tentFromBatteryW ?? 0)
                + (bucket.houseOtherFromSolarW ?? 0) + (bucket.tentFromGridW ?? 0) + (bucket.houseOtherFromGridW ?? 0);
            return Math.max(stack, bucket.pvW ?? 0);
        }),
    );
    const width = 1080;
    const inner = width - LEFT - RIGHT;
    const gap = buckets.length > 0 ? inner / buckets.length : inner;
    const barW = Math.max(4, gap * 0.72);

    return (
        <section className="gc-solar-board" style={{padding: "1.125rem"}}>
            <div style={{display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", marginBottom: 12}}>
                <div>
                    <h2>{rangeTitle(view.range)}</h2>
                    <p className="gc-solar-hint">Where the house and tent were powered from. Battery discharge counts as solar in the tent split.</p>
                </div>
            </div>
            {buckets.length === 0 ? (
                <p className="gc-solar-hint">No samples in this range yet. Gaps stay empty — never filled with 0.</p>
            ) : (
                <svg className="gc-chart" viewBox={`0 0 ${width} ${H + TOP + BOTTOM}`} role="img" aria-label="Stacked tent and house energy">
                    {[0, 0.5, 1].map((frac) => {
                        const y = TOP + H - frac * H;
                        return (
                            <g key={frac}>
                                <line x1={LEFT} x2={width - RIGHT} y1={y} y2={y} stroke="#e4e4e7" />
                                <text x={8} y={y + 4} fontSize="10" fill="#a1a1aa">{Math.round((max * frac) / 10) / 100} kW</text>
                            </g>
                        );
                    })}
                    {buckets.map((bucket, index) => {
                        const x = LEFT + index * gap + (gap - barW) / 2;
                        const parts = stackParts(bucket);
                        const missing = !finite(bucket.tentFromPvW) && !finite(bucket.tentFromGridW) && !finite(bucket.houseOtherFromSolarW);
                        if (missing) {
                            return null;
                        }
                        let y = TOP + H;
                        return (
                            <g key={bucket.t}>
                                {parts.map((part) => {
                                    const h = (part.value / max) * H;
                                    y -= h;
                                    return <rect key={part.key} x={x} y={y} width={barW} height={Math.max(0, h)} fill={part.color} rx="1" />;
                                })}
                            </g>
                        );
                    })}
                    {polylineSegments(buckets.map((bucket, index) => ({
                        x: LEFT + index * gap + gap / 2,
                        y: finite(bucket.pvW) ? TOP + H - (bucket.pvW / max) * H : null,
                    }))).map((points) => (
                        <polyline key={`pv-${points}`} fill="none" stroke="var(--gc-solar)" strokeWidth="2" points={points} />
                    ))}
                    {polylineSegments(buckets.map((bucket, index) => ({
                        x: LEFT + index * gap + gap / 2,
                        y: finite(bucket.batterySoc) ? TOP + H - (bucket.batterySoc / 100) * H : null,
                    }))).map((points) => (
                        <polyline key={`soc-${points}`} fill="none" stroke="var(--gc-battery)" strokeWidth="2" strokeDasharray="5 5" points={points} />
                    ))}
                </svg>
            )}
            <div className="gc-legend" style={{padding: "0.75rem 0 0"}}>
                <span><i className="gc-swatch" style={{background: "var(--gc-solar)"}} />Tent from solar (PV)</span>
                <span><i className="gc-swatch" style={{background: "var(--gc-battery)"}} />Tent from battery</span>
                <span><i className="gc-swatch" style={{background: "#4ade80"}} />Rest of house from solar</span>
                <span><i className="gc-swatch" style={{background: "var(--gc-grid)"}} />Tent from grid</span>
                <span><i className="gc-swatch" style={{background: "#38bdf8"}} />Rest of house from grid</span>
                <span><i className="gc-swatch" style={{background: "var(--gc-solar)", height: 2, width: 14, borderRadius: 0}} />PV production</span>
                <span><i className="gc-swatch" style={{background: "var(--gc-battery)", height: 2, width: 14, borderRadius: 0}} />Battery SoC</span>
            </div>
        </section>
    );
}

function rangeTitle(range: SolarViewDto["range"]): string {
    switch (range) {
        case "24h":
            return "24 hours";
        case "7d":
            return "7 days";
        case "30d":
            return "30 days";
        case "grow":
            return "This grow";
        default:
            return "Live";
    }
}
