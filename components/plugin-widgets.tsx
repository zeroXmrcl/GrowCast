import OverlayMotionItem from "@/components/overlay-motion-item";
import PluginMount from "@/components/plugin-mount";
import {getCurrentGrow} from "@/lib/db";
import {OVERLAY_ORDER_CLIMATE} from "@/lib/overlay-motion";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {widgetsForSlot} from "@/lib/plugins/routes";
import type {PluginWidgetSlot} from "@/lib/plugins/types";
import {widgetColumnSpan, widgetJoinsDashboardBoard} from "@/lib/plugins/widget-layout";

const CONTENTS_SLOTS = new Set<PluginWidgetSlot>(["overlay", "site-chrome", "archive", "dashboard"]);

function dashboardExtraClass(size?: string): string {
    const hair = "border-zinc-200 dark:border-zinc-800";
    if (widgetColumnSpan(size) >= 2) {
        return `border-b ${hair} sm:col-span-2`;
    }
    return `border-b last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${hair}`;
}

export default async function PluginWidgets({slot}: {slot: PluginWidgetSlot}) {
    const widgets = await widgetsForSlot(slot);
    if (widgets.length === 0) {
        return null;
    }
    const mounts = await Promise.all(widgets.map(async (item) => {
        const discovered = await findDiscoveredPlugin(item.pluginId);
        return discovered ? {item, discovered} : null;
    }));
    const present = mounts.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    if (present.length === 0) {
        return null;
    }

    if (slot === "overlay") {
        const grow = await getCurrentGrow();
        return (
            <div className="contents">
                {present.map((entry, index) => (
                    <OverlayMotionItem
                        key={`${entry.item.pluginId}:${entry.item.widget.id}`}
                        show
                        order={OVERLAY_ORDER_CLIMATE + index}
                        layout={grow.overlayLayout}
                    >
                        <PluginMount
                            pluginId={entry.item.pluginId}
                            version={entry.item.assetVersion}
                            entry={entry.discovered.manifest.ui?.entry}
                            webComponent={entry.discovered.manifest.ui?.webComponent}
                            styles={entry.discovered.manifest.ui?.styles}
                            widgetId={entry.item.widget.id}
                            role="visitor"
                            publicPage
                        />
                    </OverlayMotionItem>
                ))}
            </div>
        );
    }

    if (slot === "dashboard") {
        const board = present.filter((entry) => (
            widgetJoinsDashboardBoard(entry.item.widget, entry.discovered.manifest.exports)
        ));
        const extras = present.filter((entry) => (
            !widgetJoinsDashboardBoard(entry.item.widget, entry.discovered.manifest.exports)
        ));
        return (
            <>
                {board.map((entry) => (
                    <PluginMount
                        key={`${entry.item.pluginId}:${entry.item.widget.id}`}
                        pluginId={entry.item.pluginId}
                        version={entry.item.assetVersion}
                        entry={entry.discovered.manifest.ui?.entry}
                        webComponent={entry.discovered.manifest.ui?.webComponent}
                        styles={entry.discovered.manifest.ui?.styles}
                        widgetId={entry.item.widget.id}
                        role="visitor"
                        publicPage
                    />
                ))}
                {extras.length > 0 ? (
                    <section className="growcast-area-plugins grid sm:grid-cols-2">
                        {extras.map((entry) => (
                            <div
                                key={`${entry.item.pluginId}:${entry.item.widget.id}`}
                                className={dashboardExtraClass(entry.item.widget.size)}
                            >
                                <PluginMount
                                    pluginId={entry.item.pluginId}
                                    version={entry.item.assetVersion}
                                    entry={entry.discovered.manifest.ui?.entry}
                                    webComponent={entry.discovered.manifest.ui?.webComponent}
                                    styles={entry.discovered.manifest.ui?.styles}
                                    widgetId={entry.item.widget.id}
                                    role="visitor"
                                    publicPage
                                />
                            </div>
                        ))}
                    </section>
                ) : null}
            </>
        );
    }

    if (slot === "banner") {
        return (
            <div className="growcast-plugin-banner">
                {present.map((entry) => (
                    <PluginMount
                        key={`${entry.item.pluginId}:${entry.item.widget.id}`}
                        pluginId={entry.item.pluginId}
                        version={entry.item.assetVersion}
                        entry={entry.discovered.manifest.ui?.entry}
                        webComponent={entry.discovered.manifest.ui?.webComponent}
                        styles={entry.discovered.manifest.ui?.styles}
                        widgetId={entry.item.widget.id}
                        role="visitor"
                        publicPage
                    />
                ))}
            </div>
        );
    }

    const className = CONTENTS_SLOTS.has(slot)
        ? "contents"
        : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
    return (
        <div className={className}>
            {present.map((entry) => (
                <PluginMount
                    key={`${entry.item.pluginId}:${entry.item.widget.id}`}
                    pluginId={entry.item.pluginId}
                    version={entry.item.assetVersion}
                    entry={entry.discovered.manifest.ui?.entry}
                    webComponent={entry.discovered.manifest.ui?.webComponent}
                    styles={entry.discovered.manifest.ui?.styles}
                    widgetId={entry.item.widget.id}
                    role="visitor"
                    publicPage
                />
            ))}
        </div>
    );
}
