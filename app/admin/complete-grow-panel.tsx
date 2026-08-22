import {
    AdminButton,
    AdminCheckboxRow,
    AdminField,
    AdminInput,
    AdminPanel,
    AdminTextarea,
} from "@/components/admin/ui";
import {todayDateOnly} from "@/lib/date-only";

type CompleteGrowPanelProps = {
    growId: string;
    completeAction: (formData: FormData) => Promise<void>;
};

export function CompleteGrowPanel({growId, completeAction}: CompleteGrowPanelProps) {
    return (
        <form action={completeAction}>
            <input type="hidden" name="growId" value={growId} />
            <AdminPanel
                id="archive"
                title="Complete Grow"
                description="Finish this grow and move it to the public archive. This cannot be undone from the UI."
                className="border-red-900/50"
            >
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
                        <AdminField label="Yield (grams)" hint="Leave empty if not measured.">
                            <AdminInput
                                name="yieldGrams"
                                type="number"
                                min={0}
                                step="0.1"
                                placeholder="e.g. 120"
                            />
                        </AdminField>
                    </div>
                    <AdminField label="Final Notes" hint="How did it go? Shown on the archived grow page.">
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
                        description="All snapshots, the timelapse and dashboard pictures move to the archive, and the grow details reset for the next run. Stream URL, socials and setup info are kept."
                    />
                    <AdminButton type="submit" tone="danger" className="w-full sm:w-auto">
                        Complete &amp; Archive Grow
                    </AdminButton>
                </div>
            </AdminPanel>
        </form>
    );
}
