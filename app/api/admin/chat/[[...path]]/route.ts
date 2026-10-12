import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, originIsSameSite, validateAdminSession } from "@/lib/admin-auth";
import { CHAT_BODY_LIMIT, CHAT_RESPONSE_LIMIT, chatRequestBody, chatServiceOrigin, chatServicePath, readChatBody } from "@/lib/admin-chat-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers });

async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) return failure("Требуется вход администратора.", 401);
  if (request.method !== "GET" && !originIsSameSite(request)) return failure("Запрос с другого сайта запрещён.", 403);
  const path = chatServicePath(request.method, (await context.params).path ?? []);
  if (!path || new URL(request.url).search) return failure("Маршрут не найден.", 404);
  const secret = process.env.VCOBS_CHAT_SERVICE_SECRET;
  if (!secret || secret.length < 32) return failure("Сервис чата ещё не настроен.", 503);
  let body: string | undefined;
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return failure("Ожидается application/json.", 415);
    if (Number(request.headers.get("content-length")) > CHAT_BODY_LIMIT) return failure("Слишком большой запрос.", 413);
    try { body = JSON.stringify(chatRequestBody(path, JSON.parse(await readChatBody(request.body, CHAT_BODY_LIMIT)))); }
    catch (cause) { return failure(cause instanceof Error && cause.message === "BODY_TOO_LARGE" ? "Слишком большой запрос." : "Некорректные параметры запроса.", cause instanceof Error && cause.message === "BODY_TOO_LARGE" ? 413 : 400); }
  }
  try {
    const upstream = await fetch(`${chatServiceOrigin(process.env.VCOBS_CHAT_SERVICE_URL)}${path}`, { method: request.method, headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000) });
    const text = await readChatBody(upstream.body, CHAT_RESPONSE_LIMIT);
    const data: unknown = JSON.parse(text);
    if (upstream.status === 401 || upstream.status === 403) return failure("Сервис чата недоступен: проверьте серверную настройку подключения.", 502);
    return Response.json(data, { status: upstream.status, headers });
  } catch { return failure("Сервис чата не отвечает. Обновите соединение; перед повторной отправкой проверьте историю чата.", 502); }
}

export { handle as GET, handle as POST, handle as DELETE };
