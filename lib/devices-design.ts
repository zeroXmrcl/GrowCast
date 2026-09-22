export type DevicesDesign = "needle" | "icons";

export const DEFAULT_DEVICES_DESIGN: DevicesDesign = "needle";

export function parseDevicesDesign(value: unknown): DevicesDesign {
    return value === "icons" ? "icons" : DEFAULT_DEVICES_DESIGN;
}
