import {notFound} from "next/navigation";
import {hasGgsLiveUi} from "@/lib/ggs-live-store";

export const dynamic = "force-dynamic";

export default async function EnergyPage() {
    if (!(await hasGgsLiveUi())) {
        notFound();
    }

    return null;
}
