import {notFound} from "next/navigation";
import PluginWidgets from "@/components/plugin-widgets";
import ProgramScene from "@/plugins/restream/ui/program-scene";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {getCurrentGrow} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProgramPage() {
    if (!(await isAdminAuthenticated())) {
        notFound();
    }

    const grow = await getCurrentGrow();
    return (
        <ProgramScene
            plant={grow.plant}
            name={grow.name}
            seededAt={grow.details.seededAt}
            overlayLayout={grow.overlayLayout}
            overlayScalePct={grow.overlayScalePct}
            climateTick={grow.climateTick}
            devicesDesign={grow.devicesDesign}
            streamUrl={grow.streamUrl}
            stage={grow.details.stage}
            lightSchedule={grow.details.lightSchedule}
            strain={grow.details.strain}
        >
            <PluginWidgets slot="overlay" />
        </ProgramScene>
    );
}
