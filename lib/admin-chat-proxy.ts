export const CHAT_BODY_LIMIT = 140_000;
export const CHAT_RESPONSE_LIMIT = 4 * 1024 * 1024;

export function chatServicePath(method: string, parts: string[]): string | null {
  const path = parts.join("/");
  if (method === "GET" && ["status", "models", "chats"].includes(path)) return `/${path}`;
  if (method === "POST" && ["login", "logout", "chats"].includes(path)) return `/${path}`;
  if (parts[0] !== "chats" || !/^[A-Za-z0-9_-]{1,100}$/.test(parts[1] ?? "")) return null;
  if (parts.length === 2 && ["GET", "DELETE"].includes(method)) return `/chats/${parts[1]}`;
  if (parts.length === 3 && method === "POST" && ["messages", "stop"].includes(parts[2])) return `/chats/${parts[1]}/${parts[2]}`;
  return null;
}

export function chatRequestBody(path: string, body: unknown): Record<string, string> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Нужен JSON-объект.");
  const value = body as Record<string, unknown>;
  if (path.endsWith("/messages")) {
    if (Object.keys(value).some((key) => !["text", "model"].includes(key)) || typeof value.text !== "string" || !value.text.trim() || value.text.length > 32_000 || typeof value.model !== "string" || !value.model || value.model.length > 200) throw new Error("Укажите сообщение до 32 000 символов и доступную модель.");
    return { text: value.text, model: value.model };
  }
  if (path === "/chats") {
    if (Object.keys(value).some((key) => key !== "title") || (value.title !== undefined && (typeof value.title !== "string" || value.title.length > 200))) throw new Error("Некорректное название чата.");
    return typeof value.title === "string" ? { title: value.title } : {};
  }
  if (Object.keys(value).length) throw new Error("Лишние параметры запроса.");
  return {};
}

export function chatServiceOrigin(value: string | undefined): string {
  const url = new URL(value || "http://chat-service:3090");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid chat service origin");
  return url.origin;
}

export async function readChatBody(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}
