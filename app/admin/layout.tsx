import type {ReactNode} from "react";

/** Admin chrome is self-contained; no public site header. */
export default function AdminLayout({children}: {children: ReactNode}) {
    return <div className="min-h-full">{children}</div>;
}
