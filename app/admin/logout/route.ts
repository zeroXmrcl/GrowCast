import { NextResponse } from "next/server";
import { logoutAdmin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  await logoutAdmin();
  return NextResponse.redirect(new URL("/admin", request.url));
}
