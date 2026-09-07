import {isRestreamCaptureAuthorized} from "@/lib/restream/capture";

export function isProgramAuthorized(input: {
    admin: boolean;
    expectedToken: string | undefined;
    providedToken: string | undefined;
}): boolean {
    if (input.admin) {
        return true;
    }
    return isRestreamCaptureAuthorized(input.expectedToken, input.providedToken);
}

export function captureTokenFromRequest(request: Request): string | undefined {
    const header = request.headers.get("x-growcast-capture")?.trim();
    if (header) {
        return header;
    }
    const url = new URL(request.url);
    const query = url.searchParams.get("token")?.trim();
    return query || undefined;
}
