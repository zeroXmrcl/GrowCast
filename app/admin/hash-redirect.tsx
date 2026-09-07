"use client";

import {useEffect} from "react";
import {ADMIN_HASH_REDIRECTS} from "@/app/admin/hash-redirects";

export function AdminHashRedirect() {
    useEffect(() => {
        const dest = ADMIN_HASH_REDIRECTS[window.location.hash];
        if (dest) {
            window.location.replace(dest);
        }
    }, []);

    return null;
}
