import { NextResponse } from "next/server";
import { logoutAdmin } from "@/lib/admin-auth";
import { withRequestLog } from "@/lib/logging";
import { seeOther } from "@/lib/http-redirect";
import { isSameOriginRequest } from "@/lib/same-origin";

export async function POST(request: Request) {
  return withRequestLog(request, "/admin/logout", async () => {
    if (!isSameOriginRequest(request)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    await logoutAdmin();
    return seeOther("/admin");
  });
}
