import { NextResponse } from "next/server";
import { updatePaste } from "@/lib/pastes";

export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const text = typeof body === "object" && body !== null && "text" in body ? (body as { text?: unknown }).text : undefined;
  const result = await updatePaste((await params).slug, text);
  if (result === "updated") return NextResponse.json({ ok: true });
  if (result === "invalid-text") return NextResponse.json({ error: "Текст не должен быть пустым." }, { status: 400 });
  if (result === "too-large") return NextResponse.json({ error: "Текст длиннее 1 000 000 символов." }, { status: 413 });
  if (result === "read-only") return NextResponse.json({ error: "Эта ссылка доступна только для чтения." }, { status: 403 });
  return NextResponse.json({ error: "Ссылка не найдена или уже истекла." }, { status: 404 });
}
