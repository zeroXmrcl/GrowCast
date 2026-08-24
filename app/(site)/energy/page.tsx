import {isAdminAuthenticated} from "@/lib/admin-auth";
import EnergyScoreboard from "@/components/energy-scoreboard";
import {buildEnergyDto} from "@/lib/energy/scoreboard";

export const dynamic = "force-dynamic";

export default async function EnergyPage() {
    const isAdmin = await isAdminAuthenticated();
    const result = await buildEnergyDto({
        grow: "current",
        tariffKind: isAdmin ? "private" : "public",
    });
    const dto = result.ok ? result.dto : null;

    return (
        <main className="flex flex-1 flex-col py-10 text-zinc-900 dark:text-zinc-100">
            {dto ? (
                <EnergyScoreboard dto={dto}/>
            ) : (
                <h1 className="text-3xl font-bold tracking-tight">Energy</h1>
            )}
        </main>
    );
}
