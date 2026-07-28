import {listPublicImages} from "@/lib/list-public-images";

export default async function getDashPics(): Promise<string[]> {
    return listPublicImages("public/yourPictures", "/yourPictures");
}
