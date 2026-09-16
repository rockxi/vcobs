import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";

export const MAX_PASTE_LENGTH = 1_000_000;
export const PASTE_TTL_MS = 12 * 60 * 60 * 1000;
const DATA_DIR = process.env.PASTE_DATA_DIR ?? path.join(process.cwd(), "data", "pastes");
const SLUG_PATTERN = /^[a-zA-Z0-9_-]{8,32}$/;
const slugLocks = new Map<string, Promise<void>>();
export type Paste = { text: string; createdAt: string; editable: boolean };

function isExpired(paste: Paste) {
  const createdAt = Date.parse(paste.createdAt);
  return !Number.isFinite(createdAt) || Date.now() - createdAt >= PASTE_TTL_MS;
}

async function withSlugLock<T>(slug: string, operation: () => Promise<T>): Promise<T> {
  const previous = slugLocks.get(slug) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  slugLocks.set(slug, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release?.();
    if (slugLocks.get(slug) === tail) slugLocks.delete(slug);
  }
}

async function readCurrentPaste(slug: string): Promise<Paste | null> {
  try {
    const value = JSON.parse(await readFile(path.join(DATA_DIR, `${slug}.json`), "utf8")) as Partial<Paste>;
    if (typeof value.text !== "string" || typeof value.createdAt !== "string") return null;
    return { text: value.text, createdAt: value.createdAt, editable: value.editable === true };
  } catch {
    return null;
  }
}

export async function createPaste(text: string, editable = false) {
  await mkdir(DATA_DIR, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = randomBytes(9).toString("base64url");
    const file = await open(path.join(DATA_DIR, `${slug}.json`), "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") return null;
      throw error;
    });
    if (!file) continue;
    try {
      await file.writeFile(JSON.stringify({ text, createdAt: new Date().toISOString(), editable } satisfies Paste), "utf8");
    } finally {
      await file.close();
    }
    return slug;
  }
  throw new Error("Could not allocate a paste id.");
}

export async function getPaste(slug: string): Promise<Paste | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  return withSlugLock(slug, async () => {
    const value = await readCurrentPaste(slug);
    if (!value) return null;
    if (isExpired(value)) {
      await unlink(path.join(DATA_DIR, `${slug}.json`)).catch(() => undefined);
      return null;
    }
    // Records created before editable links were introduced are intentionally read-only.
    return value;
  });
}

export type UpdatePasteResult = "updated" | "not-found" | "read-only" | "invalid-text" | "too-large";

export async function updatePaste(slug: string, text: unknown): Promise<UpdatePasteResult> {
  if (typeof text !== "string" || !text.trim()) return "invalid-text";
  if (text.length > MAX_PASTE_LENGTH) return "too-large";
  if (!SLUG_PATTERN.test(slug)) return "not-found";
  return withSlugLock(slug, async () => {
    const paste = await readCurrentPaste(slug);
    if (!paste || isExpired(paste)) {
      if (paste) await unlink(path.join(DATA_DIR, `${slug}.json`)).catch(() => undefined);
      return "not-found";
    }
    if (!paste.editable) return "read-only";

    const target = path.join(DATA_DIR, `${slug}.json`);
    const temporary = path.join(DATA_DIR, `.${slug}.${randomBytes(8).toString("hex")}.tmp`);
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify({ ...paste, text } satisfies Paste), "utf8");
      } finally {
        await file.close();
      }
      // Re-read immediately before commit so a missing or newly-expired record is never revived.
      const current = await readCurrentPaste(slug);
      if (!current || isExpired(current)) {
        if (current) await unlink(target).catch(() => undefined);
        return "not-found";
      }
      await rename(temporary, target);
      return "updated";
    } catch {
      return "not-found";
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  });
}

export async function deleteExpiredPastes() {
  await mkdir(DATA_DIR, { recursive: true });
  const files = await readdir(DATA_DIR);
  let deleted = 0;
  await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => {
    const slug = file.slice(0, -".json".length);
    if (!SLUG_PATTERN.test(slug)) return;
    await withSlugLock(slug, async () => {
      const paste = await readCurrentPaste(slug);
      if (paste && isExpired(paste)) {
        await unlink(path.join(DATA_DIR, file));
        deleted += 1;
      }
    }).catch(() => undefined);
  }));
  return deleted;
}
