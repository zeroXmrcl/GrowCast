export type StepSample = {
    t: string;
    value: number;
};

export type StepSegment = {
    x0: number;
    x1: number;
    y: number;
    t: string;
    value: number;
};

export type StepRunPath = {
    d: string;
    segments: StepSegment[];
};

export type StepAxisLabel = {
    t: string;
    x: number;
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
            const yNum = 2 + (1 - (sample.value - min) / span) * (height - 4);
            segments.push({x0, x1, y: yNum, t: sample.t, value: sample.value});
            const y = yNum.toFixed(2);
            const x1Text = x1.toFixed(2);
            d += index === 0 ? `M${x0.toFixed(2)} ${y} H${x1Text}` : ` V${y} H${x1Text}`;
        }
        laid.push({d, segments});
    }
    return laid;
}

export function layoutStepAxis(runs: StepSample[][], width: number, height: number): StepAxisLabel[] {
    let first: StepSegment | null = null;
    let last: StepSegment | null = null;
    for (const run of layoutStepRuns(runs, width, height)) {
        for (const segment of run.segments) {
            const ms = msOf(segment.t);
            if (!first || ms < msOf(first.t)) {
                first = segment;
            }
            if (!last || ms >= msOf(last.t)) {
                last = segment;
            }
        }
    }
    if (!first || !last) {
        return [];
    }
    const midMs = (msOf(first.t) + msOf(last.t)) / 2;
    return [
        {t: first.t, x: first.x0},
        {t: new Date(midMs).toISOString(), x: (first.x0 + last.x0) / 2},
        {t: last.t, x: last.x0},
    ];
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

export type StepMorphPiece = {
    x0: number;
    x1: number;
    a: number | null;
    b: number | null;
};

export type StepMorphPaths = {
    d: string;
    fill: string;
    opacity: number;
};

export type StepMorphFrame = {
    shared: StepMorphPaths;
    fadeOut: StepMorphPaths;
    fadeIn: StepMorphPaths;
};

function yAt(runs: StepRunPath[], x: number): number | null {
    for (const run of runs) {
        const segments = run.segments;
        for (let index = 0; index < segments.length; index += 1) {
            const segment = segments[index];
            if (x >= segment.x0 && x < segment.x1) {
                return segment.y;
            }
            if (index === segments.length - 1 && x >= segment.x0 && x <= segment.x1) {
                return segment.y;
            }
        }
    }
    return null;
}

/** Screen-space samples of two step lines, so a range change can move the line already on screen. */
export function pairStepPieces(from: StepRunPath[], to: StepRunPath[], width: number): StepMorphPiece[] {
    const xs = [0, width];
    function add(runs: StepRunPath[]) {
        for (const run of runs) {
            for (const segment of run.segments) {
                if (segment.x0 > 0 && segment.x0 < width) {
                    xs.push(segment.x0);
                }
                if (segment.x1 > 0 && segment.x1 < width) {
                    xs.push(segment.x1);
                }
            }
        }
    }
    add(from);
    add(to);
    xs.sort((a, b) => a - b);
    const uniq: number[] = [];
    for (const x of xs) {
        if (uniq.length === 0 || x - uniq[uniq.length - 1] > 0.04) {
            uniq.push(x);
        }
    }
    const pieces: StepMorphPiece[] = [];
    for (let index = 0; index < uniq.length - 1; index += 1) {
        const mid = (uniq[index] + uniq[index + 1]) / 2;
        pieces.push({
            x0: uniq[index],
            x1: uniq[index + 1],
            a: yAt(from, mid),
            b: yAt(to, mid),
        });
    }
    return pieces;
}

function pathFromItems(items: ({x0: number; x1: number; y: number} | null)[], height: number): {d: string; fill: string} {
    let stroke = "";
    let fill = "";
    let run: {x0: number; x1: number; y: number}[] = [];
    function flush() {
        if (run.length === 0) {
            return;
        }
        let d = "";
        for (let index = 0; index < run.length; index += 1) {
            const y = run[index].y.toFixed(2);
            const x0 = run[index].x0.toFixed(2);
            const x1 = run[index].x1.toFixed(2);
            d += index === 0 ? `M${x0} ${y} H${x1}` : ` V${y} H${x1}`;
        }
        stroke += d;
        fill += `${d} L${run[run.length - 1].x1.toFixed(2)} ${height} L${run[0].x0.toFixed(2)} ${height} Z`;
        run = [];
    }
    for (const item of items) {
        if (!item) {
            flush();
        } else {
            run.push(item);
        }
    }
    flush();
    return {d: stroke, fill};
}

function nearestShared(sharedY: (number | null)[], index: number): number | null {
    for (let distance = 1; distance < sharedY.length; distance += 1) {
        const left = index - distance;
        const right = index + distance;
        if (left >= 0 && sharedY[left] != null) {
            return sharedY[left];
        }
        if (right < sharedY.length && sharedY[right] != null) {
            return sharedY[right];
        }
    }
    return null;
}

export function morphStepFrame(pieces: StepMorphPiece[], t: number, height: number): StepMorphFrame {
    const e = t < 0 ? 0 : t > 1 ? 1 : t;
    const sharedY = pieces.map((piece) => (
        piece.a != null && piece.b != null ? piece.a + (piece.b - piece.a) * e : null
    ));
    const shared = pieces.map((piece, index) => (
        sharedY[index] == null ? null : {x0: piece.x0, x1: piece.x1, y: sharedY[index]}
    ));
    const fadeOut = pieces.map((piece, index) => {
        if (piece.a == null || piece.b != null) {
            return null;
        }
        const toward = nearestShared(sharedY, index);
        const y = toward == null ? piece.a : piece.a + (toward - piece.a) * e;
        return {x0: piece.x0, x1: piece.x1, y};
    });
    const fadeIn = pieces.map((piece, index) => {
        if (piece.b == null || piece.a != null) {
            return null;
        }
        const from = nearestShared(sharedY, index);
        const y = from == null ? piece.b : from + (piece.b - from) * e;
        return {x0: piece.x0, x1: piece.x1, y};
    });
    return {
        shared: {...pathFromItems(shared, height), opacity: 1},
        fadeOut: {...pathFromItems(fadeOut, height), opacity: 1 - e},
        fadeIn: {...pathFromItems(fadeIn, height), opacity: e},
    };
}

export function stepRunFill(run: StepRunPath, height: number): string {
    if (!run.d || run.segments.length === 0) {
        return "";
    }
    const x0 = run.segments[0].x0.toFixed(2);
    const x1 = run.segments[run.segments.length - 1].x1.toFixed(2);
    return `${run.d} L${x1} ${height} L${x0} ${height} Z`;
}
