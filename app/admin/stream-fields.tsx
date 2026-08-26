import {
    AdminCheckboxRow,
    AdminField,
    AdminInput,
    AdminPanel,
} from "@/components/admin/ui";
import OverlayScaleInput from "@/components/overlay-scale-input";
import type {GrowRecord} from "@/lib/db";

type StreamSettingsFieldsProps = {
    grow: GrowRecord;
    overlayUrl: string;
};

export function StreamSettingsFields({grow, overlayUrl}: StreamSettingsFieldsProps) {
    return (
        <div className="space-y-6">
            <AdminPanel id="stream" title="Stream">
                <div className="space-y-4">
                    <AdminCheckboxRow
                        name="showGrowName"
                        defaultChecked={grow.showGrowName}
                        label="Show grow name above stream"
                        description="Displays the grow-name as header above the stream."
                    />
                    <AdminField label="Stream URL">
                        <AdminInput
                            name="streamUrl"
                            defaultValue={grow.streamUrl}
                            placeholder="https://..."
                        />
                    </AdminField>
                </div>
            </AdminPanel>

            <AdminPanel id="overlay" title="Overlay">
                <div className="space-y-4">
                    <div>
                        <p className="mb-3 text-xs font-semibold uppercase text-(--admin-subtle)">
                            Overlay layout
                        </p>
                        <div className="grid gap-3 md:grid-cols-2">
                            <label className="flex items-start gap-3 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3">
                                <input
                                    type="radio"
                                    name="overlayLayout"
                                    value="left-rail"
                                    defaultChecked={grow.overlayLayout !== "bottom-bar"}
                                    className="mt-0.5 h-4 w-4 border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300"
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-(--admin-text)">
                                        Left rail
                                    </span>
                                    <span className="mt-1 block text-xs text-(--admin-muted)">
                                        Stacked column inset from the left edge.
                                    </span>
                                </span>
                            </label>
                            <label className="flex items-start gap-3 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3">
                                <input
                                    type="radio"
                                    name="overlayLayout"
                                    value="bottom-bar"
                                    defaultChecked={grow.overlayLayout === "bottom-bar"}
                                    className="mt-0.5 h-4 w-4 border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300"
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-(--admin-text)">
                                        Bottom bar
                                    </span>
                                    <span className="mt-1 block text-xs text-(--admin-muted)">
                                        One strip along the bottom of the frame.
                                    </span>
                                </span>
                            </label>
                        </div>
                    </div>
                    <div>
                        <p className="mb-3 text-xs font-semibold uppercase text-(--admin-subtle)">
                            Overlay stream
                        </p>
                        <div className="grid gap-3 md:grid-cols-2">
                            <label className="flex items-start gap-3 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3">
                                <input
                                    type="radio"
                                    name="overlayStream"
                                    value="transparent"
                                    defaultChecked={grow.overlayStream !== "include"}
                                    className="mt-0.5 h-4 w-4 border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300"
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-(--admin-text)">
                                        Transparent
                                    </span>
                                    <span className="mt-1 block text-xs text-(--admin-muted)">
                                        See-through HUD. Put the tent camera under this Browser Source in OBS.
                                    </span>
                                </span>
                            </label>
                            <label className="flex items-start gap-3 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3">
                                <input
                                    type="radio"
                                    name="overlayStream"
                                    value="include"
                                    defaultChecked={grow.overlayStream === "include"}
                                    className="mt-0.5 h-4 w-4 border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300"
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-(--admin-text)">
                                        Include stream
                                    </span>
                                    <span className="mt-1 block text-xs text-(--admin-muted)">
                                        Embed the Stream URL full-frame under the HUD. Needs a Stream URL.
                                    </span>
                                </span>
                            </label>
                        </div>
                    </div>
                    <OverlayScaleInput defaultValue={grow.overlayScalePct}/>
                    <AdminField
                        label="OBS URL"
                        hint="Browser Source 1920×1080, transparent, keep running when not visible."
                    >
                        <AdminInput readOnly value={overlayUrl}/>
                    </AdminField>
                </div>
            </AdminPanel>
        </div>
    );
}
