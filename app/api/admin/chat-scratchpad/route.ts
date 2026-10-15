import { adminSessionFromRequest, originIsSameSite, validateAdminSession } from "@/lib/admin-auth";
import { CHAT_SCRATCHPAD_LIMIT, getChatScratchpad, saveChatScratchpad } from "@/lib/admin-chat-scratchpad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function GET(request: Request) {
  if (!validateAdminSession(adminSessionFromRequest(request))) return json({ error: "Войдите как администратор." }, 401);
  try { return json({ text: await getChatScratchpad() }); }
  catch { return json({ error: "Не удалось загрузить поле. Повторите попытку." }, 500); }
}

export async function PUT(request: Request) {
  if (!validateAdminSession(adminSessionFromRequest(request))) return json({ error: "Сессия администратора завершилась. Войдите снова." }, 401);
  if (!originIsSameSite(request)) return json({ error: "Некорректный источник запроса." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Ожидается JSON." }, 415);
  // Count streamed bytes as well as characters; do not trust Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Некорректный запрос." }, 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  let value: unknown;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      length += chunk.byteLength;
      if (length > CHAT_SCRATCHPAD_LIMIT * 6 + 256) { await reader.cancel(); return json({ error: "Максимум 1 000 000 символов." }, 413); }
      chunks.push(chunk);
    }
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return json({ error: "Некорректный запрос." }, 400); }
  finally { reader.releaseLock(); }
  if (!value || typeof value !== "object" || !("text" in value) || typeof value.text !== "string") return json({ error: "Ожидается текст." }, 400);
  if (value.text.length > CHAT_SCRATCHPAD_LIMIT) return json({ error: "Максимум 1 000 000 символов." }, 413);
  try { await saveChatScratchpad(value.text); return json({ saved: true }); }
  catch { return json({ error: "Не удалось сохранить поле. Текст остался в браузере; повторите попытку." }, 500); }
}
