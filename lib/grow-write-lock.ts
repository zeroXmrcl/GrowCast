let growWriteChain: Promise<unknown> = Promise.resolve();

export function _resetGrowWriteLockForTests(): void {
    growWriteChain = Promise.resolve();
}

/** Serialize complete/save so overlapping harvests cannot split the live grow. */
export function withGrowWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = growWriteChain.then(fn, fn);
    growWriteChain = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}
