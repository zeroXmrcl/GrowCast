import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {widgetsForSlot} from "@/lib/plugins/routes";
import type {PluginWidgetSlot} from "@/lib/plugins/types";

export const dynamic = "force-dynamic";

const SLOTS = new Set<PluginWidgetSlot>([
    "dashboard",
    "overlay",
    "plugin-page",
    "energy-page",
    "gallery-page",
    "archive",
    "site-chrome",
    "banner",
]);

export async function GET(request: Request) {
    const slot = new URL(request.url).searchParams.get("slot") ?? "";
    if (!SLOTS.has(slot as PluginWidgetSlot)) {
        return Response.json({error: "Unknown slot"}, {status: 400, headers: {"Cache-Control": "no-store"}});
    }
    const widgets = await widgetsForSlot(slot as PluginWidgetSlot);
    const items = [];
    for (const item of widgets) {
        const discovered = await findDiscoveredPlugin(item.pluginId);
        if (!discovered) {
            continue;
        }
        items.push({
            pluginId: item.pluginId,
            widgetId: item.widget.id,
            version: discovered.manifest.version,
            entry: discovered.manifest.ui?.entry,
            webComponent: discovered.manifest.ui?.webComponent,
            styles: discovered.manifest.ui?.styles,
        });
    }
    return Response.json({slot, widgets: items}, {headers: {"Cache-Control": "no-store"}});
}
