import {childLogger} from "@/lib/logging/logger";

export function pluginLogger() {
    return childLogger({channel: "plugins"});
}
