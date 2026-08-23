import {isValidArchiveId} from "@/lib/archives";
import {buildEnergyDto} from "@/lib/energy/scoreboard";
import {logEnergy} from "@/lib/energy/log";

function noStoreJson(body: unknown, status = 200): Response {
    return Response.json(body, {
        status,
        headers: {"Cache-Control": "no-store"},
    });
}

export async function energyGetResponse(
    request: Request,
    tariffKind: "public" | "private",
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const growParam = url.searchParams.get("grow")?.trim() || "current";
        if (growParam !== "current" && !isValidArchiveId(growParam)) {
            return noStoreJson({error: "Not found"}, 404);
        }
        const result = await buildEnergyDto({grow: growParam, tariffKind});
        if (!result.ok) {
            return noStoreJson({error: "Not found"}, 404);
        }
        return noStoreJson(result.dto);
    } catch {
        logEnergy("energy_unavailable");
        return noStoreJson({error: "Unavailable"}, 500);
    }
}
