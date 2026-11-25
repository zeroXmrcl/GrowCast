const REVERSE_DNS = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;
const RESERVED_PREFIX = "growcast.";

export const FIRST_PARTY_PLUGIN_IDS = [
    "growcast.ggs",
    "growcast.timelapse",
    "growcast.restream",
    "growcast.solar",
] as const;

export type FirstPartyPluginId = (typeof FIRST_PARTY_PLUGIN_IDS)[number];

export function isPluginId(value: string): boolean {
    return value.length >= 3 && value.length <= 80 && REVERSE_DNS.test(value);
}

export function isReservedPluginId(id: string): boolean {
    return id === "growcast" || id.startsWith(RESERVED_PREFIX);
}

export function isFirstPartyPluginId(id: string): id is FirstPartyPluginId {
    return (FIRST_PARTY_PLUGIN_IDS as readonly string[]).includes(id);
}

export function pluginServiceName(id: string): string {
    return `plugin-${id.replace(/\./g, "-")}`;
}

export function pluginUrlSlug(id: string): string {
    const parts = id.split(".");
    return parts[parts.length - 1] ?? id;
}

export function pluginIdMatchesParam(id: string, param: string): boolean {
    return id === param || pluginUrlSlug(id) === param;
}

export function assertPluginId(value: string): string {
    if (!isPluginId(value)) {
        throw new Error(`Invalid plugin id "${value}" (expected reverse-DNS, e.g. growcast.solar)`);
    }
    return value;
}
