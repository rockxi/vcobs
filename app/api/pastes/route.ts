import { NextResponse } from "next/server";
import { createPaste, MAX_PASTE_LENGTH } from "@/lib/pastes";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const text = typeof body === "object" && body !== null && "text" in body ? (body as { text?: unknown }).text : null;
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "Вставьте текст." }, { status: 400 });
  if (text.length > MAX_PASTE_LENGTH) return NextResponse.json({ error: "Текст длиннее 100 000 символов." }, { status: 413 });
  const slug = await createPaste(text);
  return NextResponse.json({ slug, url: `/${slug}` }, { status: 201 });
}
