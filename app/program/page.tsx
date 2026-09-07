import {notFound} from "next/navigation";
import ProgramScene from "@/components/program-scene";
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
            streamUrl={grow.streamUrl}
            stage={grow.details.stage}
            lightSchedule={grow.details.lightSchedule}
            strain={grow.details.strain}
        />
    );
}
