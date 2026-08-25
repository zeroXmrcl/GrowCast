import type {ReactNode} from "react";

/** Transparent HUD for OBS; site chrome would paint over the camera. */
export default function OverlayLayout({children}: {children: ReactNode}) {
    return (
        <div data-overlay-root className="h-full min-h-full">
            {children}
        </div>
    );
}
