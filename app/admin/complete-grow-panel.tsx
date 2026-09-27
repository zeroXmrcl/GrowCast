import {AdminBand} from "@/app/admin/admin-band";
import {AdminImmediateForm} from "@/app/admin/admin-save-form";
import {
    AdminButton,
    AdminCheckboxRow,
    AdminField,
    AdminInput,
    AdminTextarea,
} from "@/components/admin/ui";
import type {AdminActionResult} from "@/lib/admin/action-result";
import {todayDateOnly} from "@/lib/date-only";

type CompleteGrowPanelProps = {
    growId: string;
    completeAction: (formData: FormData) => Promise<AdminActionResult>;
};

export function CompleteGrowPanel({growId, completeAction}: CompleteGrowPanelProps) {
    return (
        <AdminImmediateForm action={completeAction}>
            <input type="hidden" name="growId" value={growId}/>
            <AdminBand id="complete" title="Complete Grow">
                <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <AdminField label="Harvest Date">
                            <AdminInput
                                name="harvestedAt"
                                type="date"
                                defaultValue={todayDateOnly()}
                                required
                            />
                        </AdminField>
                        <AdminField label="Yield (grams)">
                            <AdminInput
                                name="yieldGrams"
                                type="number"
                                min={0}
                                step="0.1"
                                placeholder="e.g. 120"
                            />
                        </AdminField>
                    </div>
                    <AdminField label="Final Notes">
                        <AdminTextarea
                            name="finalNotes"
                            rows={4}
                            placeholder="Harvest impressions, lessons learned..."
                        />
                    </AdminField>
                    <AdminCheckboxRow
                        name="confirmArchive"
                        required
                        label="I understand this moves all pictures into the archive"
                    />
                    <AdminButton type="submit" tone="danger" className="w-full sm:w-auto">
                        Complete &amp; Archive Grow
                    </AdminButton>
                </div>
            </AdminBand>
        </AdminImmediateForm>
    );
}
