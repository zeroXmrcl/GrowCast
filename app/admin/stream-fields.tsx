import {OverlayUrlCopy} from "@/app/admin/overlay-url-copy";
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
    growForm: string;
};

export function StreamSettingsFields({
    grow,
    overlayUrl,
    growForm,
}: StreamSettingsFieldsProps) {
    return (
        <div className="space-y-4">
            <AdminPanel id="overlay" title="OBS">
                <div className="space-y-4">
                    <div>
                        <p className="mb-2 text-xs font-medium text-(--admin-muted)">Overlay URL</p>
                        <OverlayUrlCopy url={overlayUrl}/>
                        <p className="mt-2 text-xs text-(--admin-subtle)">
                            Browser Source 1920x1080
                        </p>
                    </div>
                    <div>
                        <p className="mb-3 text-xs font-semibold uppercase text-(--admin-subtle)">
                            Overlay stream
                        </p>
                        <div className="grid gap-3">
                            <label className="flex items-center gap-3 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3">
                                <input
                                    type="radio"
                                    name="overlayStream"
                                    form={growForm}
                                    value="transparent"
                                    defaultChecked={grow.overlayStream !== "include"}
                                    className="h-4 w-4 border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300"
                                />
                                <span className="text-sm font-medium text-(--admin-text)">
                                    HUD Only
                                </span>
                            </label>
                            <label className="flex items-center gap-3 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3">
                                <input
                                    type="radio"
                                    name="overlayStream"
                                    form={growForm}
                                    value="include"
                                    defaultChecked={grow.overlayStream === "include"}
                                    className="h-4 w-4 border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300"
                                />
                                <span className="text-sm font-medium text-(--admin-text)">
                                    HUD + Live cam
                                </span>
                            </label>
                        </div>
                    </div>
                    <div>
                        <p className="mb-3 text-xs font-semibold uppercase text-(--admin-subtle)">
                            Overlay layout
                        </p>
                        <div className="grid gap-3">
                            <label className="flex items-center gap-3 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3">
                                <input
                                    type="radio"
                                    name="overlayLayout"
                                    form={growForm}
                                    value="left-rail"
                                    defaultChecked={grow.overlayLayout !== "bottom-bar"}
                                    className="h-4 w-4 border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300"
                                />
                                <span className="text-sm font-medium text-(--admin-text)">
                                    Left rail
                                </span>
                            </label>
                            <label className="flex items-center gap-3 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3">
                                <input
                                    type="radio"
                                    name="overlayLayout"
                                    form={growForm}
                                    value="bottom-bar"
                                    defaultChecked={grow.overlayLayout === "bottom-bar"}
                                    className="h-4 w-4 border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300"
                                />
                                <span className="text-sm font-medium text-(--admin-text)">
                                    Bottom bar
                                </span>
                            </label>
                        </div>
                    </div>
                    <OverlayScaleInput defaultValue={grow.overlayScalePct} form={growForm}/>
                </div>
            </AdminPanel>

            <AdminPanel id="stream" title="Camera">
                <div className="space-y-4">
                    <AdminField label="Stream URL">
                        <AdminInput
                            name="streamUrl"
                            form={growForm}
                            defaultValue={grow.streamUrl}
                            placeholder="https://..."
                        />
                    </AdminField>
                    <AdminCheckboxRow
                        name="showGrowName"
                        form={growForm}
                        defaultChecked={grow.showGrowName}
                        label="Show grow name above stream"
                    />
                </div>
            </AdminPanel>
        </div>
    );
}
