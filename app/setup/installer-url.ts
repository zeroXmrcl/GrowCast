import {isSafeHttpUrl} from "@/lib/url-policy";

export function isInstallerStreamUrl(value: string): boolean {
    return isSafeHttpUrl(value);
}
