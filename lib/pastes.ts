import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

export const MAX_PASTE_LENGTH = 100_000;
const DATA_DIR = process.env.PASTE_DATA_DIR ?? path.join(process.cwd(), "data", "pastes");
const SLUG_PATTERN = /^[a-zA-Z0-9_-]{8,32}$/;
export type Paste = { text: string; createdAt: string };

export async function createPaste(text: string) {
  await mkdir(DATA_DIR, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = randomBytes(9).toString("base64url");
    const file = await open(path.join(DATA_DIR, `${slug}.json`), "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") return null;
      throw error;
    });
    if (!file) continue;
    try {
      await file.writeFile(JSON.stringify({ text, createdAt: new Date().toISOString() } satisfies Paste), "utf8");
    } finally {
      await file.close();
    }
    return slug;
  }
  throw new Error("Could not allocate a paste id.");
}

export async function getPaste(slug: string): Promise<Paste | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  try {
    const value = JSON.parse(await readFile(path.join(DATA_DIR, `${slug}.json`), "utf8")) as Paste;
    if (typeof value.text !== "string" || typeof value.createdAt !== "string") return null;
    return value;
  } catch {
    return null;
  }
}
