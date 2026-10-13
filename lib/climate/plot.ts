export type StepSample = {
    t: string;
    value: number;
};

export type StepSegment = {
    x0: number;
    x1: number;
    t: string;
    value: number;
};

export type StepRunPath = {
    d: string;
    segments: StepSegment[];
};

function stepY(value: number, min: number, span: number, height: number): string {
    return (2 + (1 - (value - min) / span) * (height - 4)).toFixed(2);
}

function msOf(t: string): number {
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms : 0;
}

function stepDuration(runs: StepSample[][]): number {
    let step = Number.POSITIVE_INFINITY;
    for (const run of runs) {
        for (let index = 1; index < run.length; index += 1) {
            const delta = msOf(run[index].t) - msOf(run[index - 1].t);
            if (delta > 0 && delta < step) {
                step = delta;
            }
        }
    }
    if (Number.isFinite(step)) {
        return step;
    }
    const starts: number[] = [];
    for (const run of runs) {
        if (run.length > 0) {
            starts.push(msOf(run[0].t));
        }
    }
    starts.sort((a, b) => a - b);
    let gap = Number.POSITIVE_INFINITY;
    for (let index = 1; index < starts.length; index += 1) {
        const delta = starts[index] - starts[index - 1];
        if (delta > 0 && delta < gap) {
            gap = delta;
        }
    }
    // No two samples share a run, so the bucket width is unknown. Half the
    // nearest gap matches one missing bucket and still leaves a hole when
    // the samples are farther apart.
    return Number.isFinite(gap) ? gap / 2 : 1;
}

export function stepPath(values: number[], width: number, height: number): string {
    if (values.length === 0) {
        return "";
    }
    let min = values[0];
    let max = values[0];
    for (let index = 1; index < values.length; index += 1) {
        const value = values[index];
        if (value < min) {
            min = value;
        }
        if (value > max) {
            max = value;
        }
    }
    const span = max - min || 1;
    const slot = width / values.length;
    let path = "";
    for (let index = 0; index < values.length; index += 1) {
        const y = stepY(values[index], min, span, height);
        const x1 = ((index + 1) * slot).toFixed(2);
        path += index === 0 ? `M0 ${y} H${x1}` : ` V${y} H${x1}`;
    }
    return path;
}

export function layoutStepRuns(runs: StepSample[][], width: number, height: number): StepRunPath[] {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let minMs = Number.POSITIVE_INFINITY;
    let maxMs = Number.NEGATIVE_INFINITY;
    let count = 0;
    for (const run of runs) {
        for (const sample of run) {
            count += 1;
            if (sample.value < min) {
                min = sample.value;
            }
            if (sample.value > max) {
                max = sample.value;
            }
            const ms = msOf(sample.t);
            if (ms < minMs) {
                minMs = ms;
            }
            if (ms > maxMs) {
                maxMs = ms;
            }
        }
    }
    if (count === 0 || width <= 0 || height <= 0) {
        return [];
    }
    const span = max - min || 1;
    const step = stepDuration(runs);
    const domain = maxMs + step - minMs || 1;
    const laid: StepRunPath[] = [];
    for (const run of runs) {
        if (run.length === 0) {
            continue;
        }
        const segments: StepSegment[] = [];
        let d = "";
        for (let index = 0; index < run.length; index += 1) {
            const sample = run[index];
            const startMs = msOf(sample.t);
            const endMs = index + 1 < run.length ? msOf(run[index + 1].t) : startMs + step;
            const x0 = ((startMs - minMs) / domain) * width;
            let x1 = ((endMs - minMs) / domain) * width;
            if (x1 < x0) {
                x1 = x0;
            }
            segments.push({x0, x1, t: sample.t, value: sample.value});
            const y = stepY(sample.value, min, span, height);
            const x1Text = x1.toFixed(2);
            d += index === 0 ? `M${x0.toFixed(2)} ${y} H${x1Text}` : ` V${y} H${x1Text}`;
        }
        laid.push({d, segments});
    }
    return laid;
}

export function findStepSegment(segments: StepSegment[], x: number): StepSegment | null {
    let lo = 0;
    let hi = segments.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const segment = segments[mid];
        if (x < segment.x0) {
            hi = mid - 1;
            continue;
        }
        const atEnd = mid === segments.length - 1;
        if (x < segment.x1 || (atEnd && x <= segment.x1)) {
            return segment;
        }
        lo = mid + 1;
    }
    return null;
}
