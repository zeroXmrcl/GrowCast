"use client";

import {createContext, useContext} from "react";
import type {OverlayLayout} from "@/lib/overlay-layout";

const OverlayLayoutContext = createContext<OverlayLayout>("left-rail");

export function OverlayLayoutProvider({
    layout,
    children,
}: {
    layout: OverlayLayout;
    children: React.ReactNode;
}) {
    return <OverlayLayoutContext.Provider value={layout}>{children}</OverlayLayoutContext.Provider>;
}

export function useOverlayLayout(): OverlayLayout {
    return useContext(OverlayLayoutContext);
}
