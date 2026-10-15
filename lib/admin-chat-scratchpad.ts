import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const CHAT_SCRATCHPAD_LIMIT = 32_000;
const filePath = path.join(process.env.PASTE_DATA_DIR ?? path.join(process.cwd(), "data", "pastes"), ".admin-chat-scratchpad.json");

export async function getChatScratchpad(): Promise<string> {
  let content: string;
  try { content = await readFile(filePath, "utf8"); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return ""; throw cause; }
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || !("text" in value) || typeof value.text !== "string" || value.text.length > CHAT_SCRATCHPAD_LIMIT) throw new Error("Invalid scratchpad storage");
  return value.text;
}

export async function saveChatScratchpad(text: string): Promise<void> {
  if (typeof text !== "string" || text.length > CHAT_SCRATCHPAD_LIMIT) throw new Error("Invalid scratchpad text");
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomBytes(12).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ text }), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, filePath);
  } finally { await unlink(temporary).catch(() => undefined); }
}
