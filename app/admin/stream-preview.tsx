import OverlayHud from "@/components/overlay-hud";
import {AdminPanel} from "@/components/admin/ui";
import type {GrowRecord} from "@/lib/db";

export function StreamPreview({grow}: {grow: GrowRecord}) {
    return (
        <AdminPanel title="Preview">
            <div className="relative aspect-video w-full overflow-hidden rounded-md border border-(--admin-border) bg-(--admin-surface)">
                {grow.streamUrl ? (
                    <div className="absolute inset-0">
                        <OverlayHud
                            plant={grow.plant}
                            name={grow.name}
                            seededAt={grow.details.seededAt}
                            overlayLayout={grow.overlayLayout}
                            overlayStream="include"
                            lockStream
                            overlayScalePct={grow.overlayScalePct}
                            streamUrl={grow.streamUrl}
                            stage={grow.details.stage}
                            lightSchedule={grow.details.lightSchedule}
                            strain={grow.details.strain}
                        />
                    </div>
                ) : (
                    <div className="flex h-full items-center justify-center px-4">
                        <p className="text-sm text-(--admin-muted)">Save a Stream URL</p>
                    </div>
                )}
            </div>
        </AdminPanel>
    );
}
