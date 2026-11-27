import path from "node:path";

/**
 * Resolve `@/plugins/<folder>/...` to the plugin directory actually being
 * built (pluginsDir), and keep `@/` for the host checkout (cwd).
 *
 * `@` alone is a prefix of `@/plugins/...`. An onResolve hook is used so a
 * GROWCAST_PLUGINS_DIR tree is not silently replaced by cwd/plugins/<folder>.
 */
export function pluginModuleResolvePlugin(folder, pluginsDir) {
    const pluginRoot = path.resolve(pluginsDir, folder);
    const prefix = `@/plugins/${folder}`;
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = new RegExp(`^${escaped}(?:/|$)`);
    return {
        name: `plugin-src-${folder}`,
        setup(build) {
            build.onResolve({filter}, async (args) => {
                if (args.pluginData?.pluginSrc) {
                    return undefined;
                }
                const rest = args.path.slice(prefix.length).replace(/^\//, "");
                const target = rest ? path.join(pluginRoot, rest) : pluginRoot;
                return build.resolve(target, {
                    kind: args.kind,
                    resolveDir: pluginRoot,
                    importer: args.importer,
                    pluginData: {pluginSrc: true},
                });
            });
        },
    };
}

export function pluginBuildAliases() {
    return {"@": process.cwd()};
}
