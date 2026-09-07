"use client";

import {createContext, useContext, useMemo, useState, type ReactNode} from "react";

export type ProgramAudioGraphState = {
    active: boolean;
    analyser: AnalyserNode | null;
};

const EMPTY: ProgramAudioGraphState = {active: false, analyser: null};

const ProgramAudioGraphContext = createContext<
    ProgramAudioGraphState & {setGraph: (next: ProgramAudioGraphState) => void}
>({
    ...EMPTY,
    setGraph: () => undefined,
});

export function ProgramAudioGraphProvider({children}: {children: ReactNode}) {
    const [graph, setGraph] = useState<ProgramAudioGraphState>(EMPTY);
    const value = useMemo(
        () => ({active: graph.active, analyser: graph.analyser, setGraph}),
        [graph],
    );
    return (
        <ProgramAudioGraphContext.Provider value={value}>{children}</ProgramAudioGraphContext.Provider>
    );
}

export function useProgramAudioGraph(): ProgramAudioGraphState & {
    setGraph: (next: ProgramAudioGraphState) => void;
} {
    return useContext(ProgramAudioGraphContext);
}
