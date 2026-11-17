import PluginMount from "@/components/plugin-mount";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {widgetsForSlot} from "@/lib/plugins/routes";
import type {PluginWidgetSlot} from "@/lib/plugins/types";

export default async function PluginWidgets({slot}: {slot: PluginWidgetSlot}) {
    const widgets = await widgetsForSlot(slot);
    if (widgets.length === 0) {
        return null;
    }
    const mounts = await Promise.all(widgets.map(async (item) => {
        const discovered = await findDiscoveredPlugin(item.pluginId);
        return discovered ? {item, discovered} : null;
    }));
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mounts.map((entry) => {
                if (!entry) {
                    return null;
                }
                return (
                    <PluginMount
                        key={`${entry.item.pluginId}:${entry.item.widget.id}`}
                        pluginId={entry.item.pluginId}
                        version={entry.discovered.manifest.version}
                        entry={entry.discovered.manifest.ui?.entry}
                        webComponent={entry.discovered.manifest.ui?.webComponent}
                        styles={entry.discovered.manifest.ui?.styles}
                        widgetId={entry.item.widget.id}
                        role="visitor"
                        publicPage
                    />
                );
            })}
        </div>
    );
}
