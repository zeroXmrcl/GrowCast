import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import {overlayIdentityView} from "@/lib/overlay-identity";

export default function OverlayIdentity({
    plant,
    name,
    seededAt,
    stage,
    lightSchedule,
    strain,
}: {
    plant: string;
    name: string;
    seededAt: string;
    stage: string;
    lightSchedule: string;
    strain: string;
}) {
    const view = overlayIdentityView({plant, name, seededAt, stage, lightSchedule, strain});

    return (
        <section className={OVERLAY_PANEL_CLASS}>
            <p className="text-lg font-semibold tracking-tight text-zinc-50">{view.title}</p>
            <p className="mt-1 text-sm tabular-nums text-zinc-300">{view.metaLine}</p>
            {view.strain ? (
                <p className="mt-1 text-sm text-zinc-400">{view.strain}</p>
            ) : null}
        </section>
    );
}
