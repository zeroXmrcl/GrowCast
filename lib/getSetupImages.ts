import {listPublicImages} from "@/lib/list-public-images";

export default async function getSetupImages(): Promise<string[]> {
    return listPublicImages("public/setup", "/setup");
}
