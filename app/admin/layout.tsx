import {Suspense, type ReactNode} from "react";
import {AdminSidebar} from "@/app/admin/admin-chrome";
import {AdminToast} from "@/app/admin/admin-toast";
import {isAdminAuthenticated} from "@/lib/admin-auth";

/** Admin chrome is self-contained; no public site header. */
export default async function AdminLayout({children}: {children: ReactNode}) {
    const loggedIn = await isAdminAuthenticated();

    return (
        <div className="min-h-full">
            {loggedIn ? (
                <div className="admin-theme min-h-screen bg-(--admin-bg) text-(--admin-text) lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
                    <AdminSidebar/>
                    {children}
                </div>
            ) : children}
            <Suspense fallback={null}>
                <AdminToast/>
            </Suspense>
        </div>
    );
}
