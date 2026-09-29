export type DevicesDesign = "needle" | "icons";

export const DEFAULT_DEVICES_DESIGN: DevicesDesign = "icons";

export function parseDevicesDesign(value: unknown): DevicesDesign {
    if (value === "needle" || value === "icons") {
        return value;
    }
    return DEFAULT_DEVICES_DESIGN;
}
