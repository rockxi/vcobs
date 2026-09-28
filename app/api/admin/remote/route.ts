import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin-auth";

function cookieValue(request: Request): string | undefined {
  for (const part of (request.headers.get("cookie") || "").split(";")) { const [name, ...value] = part.trim().split("="); if (name === ADMIN_SESSION_COOKIE) return value.join("=") || undefined; }
}
export async function GET(request: Request) {
  if (!validateAdminSession(cookieValue(request))) return new NextResponse("Forbidden", { status: 403 });
  const relay = process.env.VCOBS_REMOTE_RELAY_INTERNAL_URL || "http://remote-relay:3081";
  try {
    const response = await fetch(`${relay}/internal/devices`, { headers: { authorization: `Bearer ${process.env.VCOBS_ADMIN_SESSION_SECRET || ""}` }, cache: "no-store", signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return new NextResponse("Remote relay unavailable", { status: 503 });
    return NextResponse.json(await response.json(), { headers: { "cache-control": "no-store" } });
  } catch { return new NextResponse("Remote relay unavailable", { status: 503 }); }
}
