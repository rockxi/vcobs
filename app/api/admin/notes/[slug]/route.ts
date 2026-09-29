import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, originIsSameSite, validateAdminSession } from "@/lib/admin-auth";
import { getPublishedNoteSource } from "@/lib/couch";
import { savePublishedNote } from "@/lib/couch-editor";
import { getExcalidrawData } from "@/lib/markdown";

export const dynamic = "force-dynamic";
const MAX_REQUEST_BYTES = 9 * 1024 * 1024;

async function authorized() {
  return validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);
}

async function limitedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Empty body");
  const chunks: Buffer[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new RangeError("Too large"); }
    chunks.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!await authorized()) return NextResponse.json({ error: "Требуется вход администратора." }, { status: 401 });
  const { slug } = await params;
  try {
    const source = await getPublishedNoteSource(slug);
    if (!source) return NextResponse.json({ error: "Заметка не найдена." }, { status: 404 });
    if (getExcalidrawData(source.markdown)) return NextResponse.json({ error: "Рисунок Excalidraw нельзя редактировать как Markdown." }, { status: 422 });
    return NextResponse.json({ markdown: source.markdown, revision: source.note._rev, path: source.note.path, conflict: Boolean(source.note._conflicts?.length) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить заметку из CouchDB." }, { status: 502 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!await authorized()) return NextResponse.json({ error: "Требуется вход администратора." }, { status: 401 });
  if (!originIsSameSite(request)) return NextResponse.json({ error: "Недопустимый источник запроса." }, { status: 403 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_REQUEST_BYTES) return NextResponse.json({ error: "Заметка слишком большая." }, { status: 413 });
  let body: unknown;
  try { body = await limitedJson(request); } catch (error) { return NextResponse.json({ error: error instanceof RangeError ? "Заметка слишком большая." : "Некорректный запрос." }, { status: error instanceof RangeError ? 413 : 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  const { markdown, revision } = body as { markdown?: unknown; revision?: unknown };
  if (typeof markdown !== "string" || typeof revision !== "string") return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  try {
    const result = await savePublishedNote((await params).slug, markdown, revision);
    if (result.kind === "saved") return NextResponse.json({ ok: true, revision: result.revision }, { headers: { "Cache-Control": "private, no-store" } });
    const errors = {
      "not-found": [404, "Заметка больше не опубликована."],
      conflict: [409, "Заметка уже изменена в Obsidian или другой вкладке. Скопируйте свои правки и загрузите актуальную версию."],
      invalid: [400, "Сохраните исходное свойство vcobs-link и проверьте Markdown."],
      "too-large": [413, "Заметка превышает лимит 8 МиБ."],
      drawing: [422, "Рисунок Excalidraw нельзя редактировать как Markdown."],
      failed: [502, "Не удалось сохранить заметку в CouchDB. Попробуйте снова."],
    } as const;
    const [status, error] = errors[result.kind];
    return NextResponse.json({ error }, { status });
  } catch {
    return NextResponse.json({ error: "CouchDB недоступна. Правки остались в редакторе." }, { status: 502 });
  }
}
