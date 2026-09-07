import type {ReactNode} from "react";

/** 1920×1080 program document; site chrome would paint over the camera. */
export default function ProgramLayout({children}: {children: ReactNode}) {
    return (
        <div className="h-[1080px] w-[1920px] overflow-hidden bg-black">
            {children}
        </div>
    );
}
