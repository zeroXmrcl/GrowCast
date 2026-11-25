import {pluginImportMapJson} from "@/lib/plugins/import-map";

export function PluginImportMap() {
    return (
        <script
            type="importmap"
            dangerouslySetInnerHTML={{__html: pluginImportMapJson()}}
        />
    );
}
