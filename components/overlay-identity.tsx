import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import {getDaysSince} from "@/utils/daysSinceSeeding";

export default function OverlayIdentity({
    plant,
    name,
    seededAt,
}: {
    plant: string;
    name: string;
    seededAt: string;
}) {
    const label = plant.trim() || name.trim() || "Plant";

    return (
        <section className={OVERLAY_PANEL_CLASS}>
            <p className="text-lg font-semibold tracking-tight text-zinc-50">{label}</p>
            <p className="mt-1 text-sm tabular-nums text-zinc-300">Day {getDaysSince(seededAt)}</p>
        </section>
    );
}
