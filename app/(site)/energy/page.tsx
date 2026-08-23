import {notFound} from "next/navigation";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import EnergyScoreboard from "@/components/energy-scoreboard";
import {isValidArchiveId} from "@/lib/archives";
import {buildEnergyDto, listEnergyGrowOptions} from "@/lib/energy/scoreboard";

export const dynamic = "force-dynamic";

type EnergyPageProps = {
    searchParams: Promise<{grow?: string}>;
};

export default async function EnergyPage({searchParams}: EnergyPageProps) {
    const params = await searchParams;
    const growParam = params.grow?.trim() || "current";
    if (growParam !== "current" && !isValidArchiveId(growParam)) {
        notFound();
    }

    const isAdmin = await isAdminAuthenticated();
    const [result, grows] = await Promise.all([
        buildEnergyDto({
            grow: growParam,
            tariffKind: isAdmin ? "private" : "public",
        }),
        listEnergyGrowOptions(),
    ]);

    if (!result.ok) {
        notFound();
    }

    return (
        <main className="min-h-screen bg-white px-4 py-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 md:px-8">
            <div className="mx-auto w-full max-w-7xl">
                <EnergyScoreboard dto={result.dto} grows={grows}/>
            </div>
        </main>
    );
}
