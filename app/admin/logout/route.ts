import { NextResponse } from "next/server";
import { logoutAdmin } from "@/lib/admin-auth";
import { withRequestLog } from "@/lib/logging";

export async function POST(request: Request) {
  return withRequestLog(request, "/admin/logout", async () => {
    await logoutAdmin();
    return NextResponse.redirect(new URL("/admin", request.url));
  });
}
