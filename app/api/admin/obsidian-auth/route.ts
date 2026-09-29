import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, publicRequestOrigin, validateAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))?.slice(ADMIN_SESSION_COOKIE.length + 1);
  const authorized = publicRequestOrigin(request) !== null && validateAdminSession(token);
  return new NextResponse(null, {
    status: authorized ? 204 : 401,
    headers: { "Cache-Control": "private, no-store" },
  });
}
