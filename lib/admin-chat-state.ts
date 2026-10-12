export type Chat = { id: string; title: string; createdAt: string; updatedAt: string; status: string; error?: string | null };
export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; createdAt: string };
export type ChatModel = { id: string; name: string; description?: string; default?: boolean };
export type ChatStatus = { configured: boolean; ready: boolean; account: { type: string } | null; login: { verificationUrl: string; userCode: string; status: string } | null; error?: string | null };
export function recoverFailedChatLogin(status: ChatStatus): ChatStatus {
  return status.login?.status === "error"
    ? { ...status, login: null, error: "Вход в ChatGPT не завершён. Попробуйте подключить аккаунт ещё раз." }
    : status;
}
export function chooseChatModel(models: ChatModel[], current: string): string {
  return models.some((model) => model.id === current) ? current : (models.find((model) => model.default) ?? models[0])?.id ?? "";
}
export function canSendChat(status: ChatStatus | null, model: string, text: string, running: boolean, busy: boolean): boolean {
  return Boolean(status?.ready && model && text.trim() && text.length <= 32_000 && !running && !busy);
}
export function safeDeviceLoginUrl(value: string): string | null {
  try { const url = new URL(value); return url.protocol === "https:" && ["auth.openai.com", "chatgpt.com"].includes(url.hostname) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function chatDrawerTabTarget(currentIndex: number, count: number, backwards: boolean): number | null {
  if (!count) return null;
  if (currentIndex < 0) return backwards ? count - 1 : 0;
  if (backwards && currentIndex === 0) return count - 1;
  if (!backwards && currentIndex === count - 1) return 0;
  return null;
}
