import {Suspense, type ReactNode} from "react";
import {AdminToast} from "@/app/admin/admin-toast";

/** Admin chrome is self-contained; no public site header. */
export default function AdminLayout({children}: {children: ReactNode}) {
    return (
        <div className="min-h-full">
            {children}
            <Suspense fallback={null}>
                <AdminToast/>
            </Suspense>
        </div>
    );
}
