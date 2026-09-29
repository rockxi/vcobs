import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin-auth";
import { findMarkdownFiles } from "@/lib/couch";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) return NextResponse.json({ error: "Требуется вход администратора." }, { status: 401 });
  try {
    const notes = (await findMarkdownFiles()).map(({ _id, path, mtime, type }) => ({ id: _id, path, mtime, type }));
    notes.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0) || a.path.localeCompare(b.path));
    return NextResponse.json({ notes }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить список заметок из CouchDB." }, { status: 502 });
  }
}
