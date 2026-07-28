import type {ReactNode} from "react";
import SiteHeader from "@/components/site-header";

export default function SiteLayout({children}: {children: ReactNode}) {
    return (
        <div className="flex min-h-full flex-col">
            <SiteHeader/>
            <div className="flex flex-1 flex-col">{children}</div>
        </div>
    );
}
