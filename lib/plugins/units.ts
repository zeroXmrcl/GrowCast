import {PLUGIN_UNITS, type PluginUnit} from "@/lib/plugins/types";

export function isPluginUnit(value: string): value is PluginUnit {
    return (PLUGIN_UNITS as readonly string[]).includes(value);
}
