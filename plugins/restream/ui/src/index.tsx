"use client";

import {definePlugin} from "@growcast/plugin-sdk/ui";
import {BroadcastToast} from "@/plugins/restream/ui/broadcast-toast";
import AdminStreamPage from "@/plugins/restream/admin/page";
import OverlayCapturePage from "@/plugins/restream/pages/capture";
import ProgramPage from "@/plugins/restream/pages/program";

export default definePlugin({
    pages: {
        admin: AdminStreamPage,
        capture: OverlayCapturePage,
        program: ProgramPage,
    },
    widgets: {
        "broadcast-toast": BroadcastToast,
    },
});
