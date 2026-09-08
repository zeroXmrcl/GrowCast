"use client";

import {createContext, useContext, useMemo, useState, type ReactNode} from "react";
import {
    DEFAULT_MUSIC_LOOK,
    DEFAULT_WAVE_BARS,
    type MusicLook,
} from "@/lib/program-music-wave";

export type ProgramAudioGraphState = {
    active: boolean;
    analyser: AnalyserNode | null;
    title: string;
    currentTime: number;
    duration: number;
    musicLook: MusicLook;
    waveBars: number;
};

const EMPTY: ProgramAudioGraphState = {
    active: false,
    analyser: null,
    title: "",
    currentTime: 0,
    duration: 0,
    musicLook: DEFAULT_MUSIC_LOOK,
    waveBars: DEFAULT_WAVE_BARS,
};

const ProgramAudioGraphContext = createContext<
    ProgramAudioGraphState & {setGraph: (next: ProgramAudioGraphState) => void}
>({
    ...EMPTY,
    setGraph: () => undefined,
});

export function ProgramAudioGraphProvider({children}: {children: ReactNode}) {
    const [graph, setGraph] = useState<ProgramAudioGraphState>(EMPTY);
    const value = useMemo(() => ({...graph, setGraph}), [graph]);
    return (
        <ProgramAudioGraphContext.Provider value={value}>{children}</ProgramAudioGraphContext.Provider>
    );
}

export function useProgramAudioGraph(): ProgramAudioGraphState & {
    setGraph: (next: ProgramAudioGraphState) => void;
} {
    return useContext(ProgramAudioGraphContext);
}
