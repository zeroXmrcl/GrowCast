"use client";

import {definePlugin} from "@growcast/plugin-sdk/ui";
import AdminTimelapsePage from "@/plugins/timelapse/admin/page";
import GalleryPage from "@/plugins/timelapse/pages/gallery";

export default definePlugin({
    pages: {
        gallery: GalleryPage,
        admin: AdminTimelapsePage,
    },
    widgets: {},
});
