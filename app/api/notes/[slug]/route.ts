import { NextResponse } from "next/server";
import { originIsSameSite } from "@/lib/admin-auth";
import { getPublishedNoteSource, getVcobsEditable, stripFrontmatter } from "@/lib/couch";
import { savePublishedNote } from "@/lib/couch-editor";
import { getExcalidrawData } from "@/lib/markdown";

export const dynamic = "force-dynamic";
const MAX_REQUEST_BYTES = 9 * 1024 * 1024;
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const source = await getPublishedNoteSource((await params).slug);
    if (!source || !getVcobsEditable(source.markdown)) return NextResponse.json({ error: "Редактирование недоступно." }, { status: 404, headers: noStore });
    if (getExcalidrawData(source.markdown)) return NextResponse.json({ error: "Рисунок нельзя редактировать как Markdown." }, { status: 422, headers: noStore });
    return NextResponse.json({ markdown: stripFrontmatter(source.markdown), revision: source.note._rev, path: source.note.path, conflict: Boolean(source.note._conflicts?.length) }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить заметку." }, { status: 502, headers: noStore });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!originIsSameSite(request)) return NextResponse.json({ error: "Недопустимый источник запроса." }, { status: 403, headers: noStore });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) return NextResponse.json({ error: "Заметка слишком большая." }, { status: 413, headers: noStore });
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new RangeError(); }
      chunks.push(Buffer.from(value));
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof RangeError ? "Заметка слишком большая." : "Некорректный запрос." }, { status: error instanceof RangeError ? 413 : 400, headers: noStore });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Некорректный запрос." }, { status: 400, headers: noStore });
  const { markdown, revision } = body as { markdown?: unknown; revision?: unknown };
  if (typeof markdown !== "string" || typeof revision !== "string") return NextResponse.json({ error: "Некорректный запрос." }, { status: 400, headers: noStore });
  try {
    const result = await savePublishedNote((await params).slug, markdown, revision, true);
    if (result.kind === "saved") return NextResponse.json({ ok: true, revision: result.revision }, { headers: noStore });
    const errors = {
      "not-found": [404, "Редактирование больше недоступно."],
      conflict: [409, "Заметка уже изменена. Скопируйте свои правки и загрузите актуальную версию."],
      invalid: [400, "Некорректный запрос."],
      "too-large": [413, "Заметка превышает лимит 8 МиБ."],
      drawing: [422, "Рисунок нельзя редактировать как Markdown."],
      failed: [502, "Не удалось сохранить заметку."],
    } as const;
    const [status, error] = errors[result.kind];
    return NextResponse.json({ error }, { status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Не удалось сохранить заметку. Правки остались в редакторе." }, { status: 502, headers: noStore });
  }
}
