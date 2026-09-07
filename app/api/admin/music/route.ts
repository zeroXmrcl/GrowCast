import {revalidatePath} from "next/cache";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {applyMusicPost} from "@/lib/admin/apply-music-post";
import {withNotice} from "@/lib/admin/notice";
import {logAuthzDenied, withRequestLog} from "@/lib/logging";
import {seeOther} from "@/lib/http-redirect";
import {isSameOriginRequest} from "@/lib/same-origin";
import {
    MUSIC_MAX_BODY_BYTES,
    contentLengthExceedsCap,
    payloadTooLargeResponse,
} from "@/lib/request-body-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
    return withRequestLog(request, "/api/admin/music", async () => {
        if (contentLengthExceedsCap(request.headers.get("content-length"), MUSIC_MAX_BODY_BYTES)) {
            return payloadTooLargeResponse("POST", "/api/admin/music");
        }

        if (!isSameOriginRequest(request)) {
            return seeOther(withNotice("/admin/stream", "music_invalid_file"));
        }

        if (!(await isAdminAuthenticated())) {
            logAuthzDenied({reason: "unauthenticated", resource: "admin.music"});
            return seeOther("/admin?error=unauthorized");
        }

        let result;
        try {
            result = await applyMusicPost(await request.formData());
        } catch {
            return seeOther(withNotice("/admin/stream", "music_invalid_file"));
        }

        if (!result.ok) {
            return seeOther(withNotice("/admin/stream", result.notice));
        }

        revalidatePath("/admin/stream");
        revalidatePath("/program");
        revalidatePath("/overlay/capture");
        return seeOther(withNotice("/admin/stream", result.notice));
    });
}
