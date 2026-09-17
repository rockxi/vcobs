import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, originIsSameSite, validateAdminSession } from "@/lib/admin-auth";
import { deletePaste, setPasteEditable } from "@/lib/pastes";

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
  const result = await deletePaste((await params).slug);
  if (result === "deleted") return NextResponse.json({ ok: true });
  return NextResponse.json({ error: "Ссылка не найдена или уже истекла." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!adminRequestAllowed(request)) return new NextResponse("Forbidden", { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const editable = typeof body === "object" && body !== null && "editable" in body ? (body as { editable?: unknown }).editable : undefined;
  if (typeof editable !== "boolean") return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  const result = await setPasteEditable((await params).slug, editable);
  if (result === "updated") return NextResponse.json({ ok: true, editable });
  return NextResponse.json({ error: "Ссылка не найдена или уже истекла." }, { status: 404 });
}
