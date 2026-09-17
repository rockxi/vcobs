import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, originIsSameSite, validateAdminSession } from "@/lib/admin-auth";
import { deleteSharedFile } from "@/lib/shared-files";

function sessionFromRequest(request: Request): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === ADMIN_SESSION_COOKIE) return value.join("=") || undefined;
  }
  return undefined;
}

function adminRequestAllowed(request: Request): boolean {
  return originIsSameSite(request) && validateAdminSession(sessionFromRequest(request));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!adminRequestAllowed(request)) return new NextResponse("Forbidden", { status: 403 });
  const result = await deleteSharedFile((await params).slug);
  if (result === "deleted") return NextResponse.json({ ok: true });
  return NextResponse.json({ error: "Файл не найден или уже истек." }, { status: 404 });
}
