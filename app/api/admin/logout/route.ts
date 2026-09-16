import { NextResponse } from "next/server";
import { expiredAdminSessionCookie, originIsSameSite } from "@/lib/admin-auth";
export async function POST(request: Request) { if (!originIsSameSite(request)) return new NextResponse("Forbidden", { status: 403 }); const response = NextResponse.redirect(new URL("/admin", request.url), 303); response.cookies.set(expiredAdminSessionCookie()); return response; }
