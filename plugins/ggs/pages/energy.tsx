import {notFound} from "next/navigation";
import EnergyScoreboard from "@/plugins/ggs/ui/energy-scoreboard";
import {hasGgsLiveUi} from "@/plugins/ggs/host/ggs-live-store";

export const dynamic = "force-dynamic";

export default async function EnergyPage() {
    if (!(await hasGgsLiveUi())) {
        notFound();
    }
    return <EnergyScoreboard />;
}
