import { NextResponse } from "next/server";
import { createPaste, MAX_PASTE_LENGTH } from "@/lib/pastes";
import { adminSessionFromRequest, originIsSameSite, validateAdminSession } from "@/lib/admin-auth";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const text = typeof body === "object" && body !== null && "text" in body ? (body as { text?: unknown }).text : null;
  const editable = typeof body === "object" && body !== null && "editable" in body && (body as { editable?: unknown }).editable === true;
  const adminOnlyValue = typeof body === "object" && body !== null && "adminOnly" in body ? (body as { adminOnly?: unknown }).adminOnly : false;
  if (typeof adminOnlyValue !== "boolean") return NextResponse.json({ error: "Некорректный параметр доступа." }, { status: 400 });
  if (adminOnlyValue) {
    if (!validateAdminSession(adminSessionFromRequest(request))) return NextResponse.json({ error: "Войдите как администратор." }, { status: 401 });
    if (!originIsSameSite(request)) return NextResponse.json({ error: "Некорректный источник запроса." }, { status: 403 });
  }
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "Вставьте текст." }, { status: 400 });
  if (text.length > MAX_PASTE_LENGTH) return NextResponse.json({ error: "Текст длиннее 1 000 000 символов." }, { status: 413 });
  const slug = await createPaste(text, editable, adminOnlyValue);
  return NextResponse.json({ slug, url: `/${slug}` }, { status: 201 });
}
