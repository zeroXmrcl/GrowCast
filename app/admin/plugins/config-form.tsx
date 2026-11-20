import {savePluginConfigAction} from "@/app/admin/plugins/actions";
import type {PluginConfigField, PluginManifest} from "@/lib/plugins/types";
import type {PluginConfigValues} from "@/lib/plugins/config";

export function PluginConfigForm({
    pluginId,
    manifest,
    values,
}: {
    pluginId: string;
    manifest: PluginManifest;
    values: PluginConfigValues;
}) {
    const fields = Object.entries(manifest.config);
    if (fields.length === 0) {
        return null;
    }
    return (
        <form action={savePluginConfigAction} className="mt-4 grid gap-3">
            <input type="hidden" name="pluginId" value={pluginId} />
            {fields.map(([key, field]) => (
                <label key={key} className="grid gap-1 text-sm text-(--admin-text)">
                    <span>{field.label ?? key}</span>
                    {renderField(key, field, values[key])}
                </label>
            ))}
            <button type="submit" className="w-fit rounded-md border border-(--admin-border) px-3 py-1.5 text-sm">
                Save settings
            </button>
        </form>
    );
}

function renderField(key: string, field: PluginConfigField, value: string | number | boolean | undefined) {
    if (field.type === "boolean") {
        return (
            <input
                type="checkbox"
                name={key}
                value="true"
                defaultChecked={value === true || value === "true"}
            />
        );
    }
    if (field.type === "enum" && field.values) {
        return (
            <select
                name={key}
                defaultValue={value === undefined ? String(field.default ?? "") : String(value)}
                className="rounded-md border border-(--admin-border) bg-transparent px-2 py-1"
            >
                {field.values.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        );
    }
    const inputType = field.type === "secret" ? "password" : field.type === "integer" || field.type === "number" ? "number" : "text";
    return (
        <input
            type={inputType}
            name={key}
            defaultValue={field.type === "secret" ? "" : value === undefined ? "" : String(value)}
            placeholder={field.type === "secret" ? "unchanged" : undefined}
            min={field.min}
            max={field.max}
            step={field.type === "integer" ? 1 : undefined}
            required={field.required && field.type !== "secret"}
            className="rounded-md border border-(--admin-border) bg-transparent px-2 py-1"
        />
    );
}
