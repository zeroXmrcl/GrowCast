/**
 * Packed plugin host modules cannot import GrowCast TypeScript at runtime.
 * Core binds `isAdminAuthenticated` onto this well-known symbol so those
 * modules can reuse the live session check in-process.
 */
export const PACKED_PLUGIN_ADMIN_AUTH = Symbol.for("growcast.packedPlugin.isAdminAuthenticated");

export type PackedPluginAdminAuth = (deps?: unknown) => Promise<boolean>;

export function readPackedPluginAdminAuth(): PackedPluginAdminAuth | null {
    const bound = (globalThis as Record<symbol, unknown>)[PACKED_PLUGIN_ADMIN_AUTH];
    return typeof bound === "function" ? bound as PackedPluginAdminAuth : null;
}

export function bindPackedPluginAdminAuth(fn: PackedPluginAdminAuth): void {
    (globalThis as Record<symbol, unknown>)[PACKED_PLUGIN_ADMIN_AUTH] = fn;
}
