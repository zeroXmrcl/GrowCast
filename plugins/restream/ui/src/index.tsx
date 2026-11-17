"use client";

import {definePlugin} from "@growcast/plugin-sdk/ui";
import {BroadcastToast} from "@/plugins/restream/ui/broadcast-toast";

export default definePlugin({
    pages: {},
    widgets: {
        "broadcast-toast": BroadcastToast,
    },
});
