import {revalidatePath} from "next/cache";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {applyMediaPost} from "@/lib/admin/apply-media-post";
import {withNotice} from "@/lib/admin/notice";
import {
    logAdminMediaDeleteFailed,
    logAdminMediaDeleted,
    logAdminMediaUploadFailed,
    logAdminMediaUploaded,
    logAuthzDenied,
    sanitizeError,
    withRequestLog,
} from "@/lib/logging";
import {seeOther} from "@/lib/http-redirect";
import {isSameOriginRequest} from "@/lib/same-origin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
    return withRequestLog(request, "/api/admin/media", async () => {
        if (!isSameOriginRequest(request)) {
            logAdminMediaUploadFailed({reason: "cross_origin"});
            return seeOther(withNotice("/admin", "media_upload_failed"));
        }

        if (!(await isAdminAuthenticated())) {
            logAuthzDenied({reason: "unauthenticated", resource: "admin.media"});
            return seeOther("/admin?error=unauthorized");
        }

        let result;
        try {
            result = await applyMediaPost(await request.formData());
        } catch (error) {
            logAdminMediaUploadFailed({err: sanitizeError(error)});
            return seeOther(withNotice("/admin", "media_upload_failed"));
        }

        if (!result.ok) {
            if (result.notice === "media_delete_failed") {
                logAdminMediaDeleteFailed({
                    collection: result.collection,
                    filename: result.filename,
                    reason: result.reason,
                });
            } else {
                logAdminMediaUploadFailed({
                    collection: result.collection,
                    reason: result.reason,
                    rejected: result.rejected,
                });
            }
            return seeOther(withNotice("/admin", result.notice));
        }

        if (result.notice === "deleted") {
            logAdminMediaDeleted({collection: result.collection, filename: result.filename});
        } else {
            logAdminMediaUploaded({
                collection: result.collection,
                count: result.saved,
                rejected: result.rejected,
            });
        }

        revalidatePath("/");
        revalidatePath("/admin");
        return seeOther(withNotice("/admin", result.notice));
    });
}
