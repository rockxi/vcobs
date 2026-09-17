import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";

export const MAX_PASTE_LENGTH = 1_000_000;
export const PASTE_TTL_MS = 12 * 60 * 60 * 1000;
const DATA_DIR = process.env.PASTE_DATA_DIR ?? path.join(process.cwd(), "data", "pastes");
const SLUG_PATTERN = /^[a-zA-Z0-9_-]{8,32}$/;
const slugLocks = new Map<string, Promise<void>>();
export type Paste = { text: string; createdAt: string; editable: boolean };
export type PasteInventoryItem = {
  slug: string;
  createdAt: string;
  expiresAt: string;
  length: number;
  editable: boolean;
};

function isExpired(paste: Paste, now = Date.now()) {
  const createdAt = Date.parse(paste.createdAt);
  return !Number.isFinite(createdAt) || now - createdAt >= PASTE_TTL_MS;
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

/**
 * Reads the active paste registry without changing it.  The admin view must not
 * turn a page visit into cleanup, so unlike getPaste this deliberately leaves
 * expired or malformed records alone for the scheduled cleanup job.
 */
export async function listActivePastes(now = Date.now()): Promise<PasteInventoryItem[]> {
  let files: string[];
  try {
    files = await readdir(DATA_DIR);
  } catch {
    return [];
  }
  const records = await Promise.all(files.map(async (file) => {
    if (!file.endsWith(".json")) return null;
    const slug = file.slice(0, -".json".length);
    if (!SLUG_PATTERN.test(slug)) return null;
    const paste = await readCurrentPaste(slug);
    if (!paste || isExpired(paste, now)) return null;
    const createdAt = Date.parse(paste.createdAt);
    return { slug, createdAt: paste.createdAt, expiresAt: new Date(createdAt + PASTE_TTL_MS).toISOString(), length: paste.text.length, editable: paste.editable };
  }));
  return records.filter((record): record is PasteInventoryItem => record !== null).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.slug.localeCompare(b.slug));
}

export type UpdatePasteResult = "updated" | "not-found" | "read-only" | "invalid-text" | "too-large";

export type DeletePasteResult = "deleted" | "not-found";
export type SetPasteEditableResult = "updated" | "not-found";

async function writePasteAtomically(slug: string, paste: Paste): Promise<boolean> {
  const target = path.join(DATA_DIR, `${slug}.json`);
  const temporary = path.join(DATA_DIR, `.${slug}.${randomBytes(8).toString("hex")}.tmp`);
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(paste), "utf8");
    } finally {
      await file.close();
    }
    // Re-read immediately before commit so a missing or newly-expired record is never revived.
    const current = await readCurrentPaste(slug);
    if (!current || isExpired(current)) {
      if (current) await unlink(target).catch(() => undefined);
      return false;
    }
    await rename(temporary, target);
    return true;
  } catch {
    return false;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

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

    return (await writePasteAtomically(slug, { ...paste, text })) ? "updated" : "not-found";
  });
}

/** Removes an active paste. Invalid, missing, and expired slugs are deliberately indistinguishable. */
export async function deletePaste(slug: string): Promise<DeletePasteResult> {
  if (!SLUG_PATTERN.test(slug)) return "not-found";
  return withSlugLock(slug, async () => {
    const paste = await readCurrentPaste(slug);
    const target = path.join(DATA_DIR, `${slug}.json`);
    if (!paste || isExpired(paste)) {
      if (paste) await unlink(target).catch(() => undefined);
      return "not-found";
    }
    try {
      await unlink(target);
      return "deleted";
    } catch {
      return "not-found";
    }
  });
}

/** Sets public editability for an active paste, including records created before this field existed. */
export async function setPasteEditable(slug: string, editable: unknown): Promise<SetPasteEditableResult> {
  if (typeof editable !== "boolean" || !SLUG_PATTERN.test(slug)) return "not-found";
  return withSlugLock(slug, async () => {
    const paste = await readCurrentPaste(slug);
    if (!paste || isExpired(paste)) {
      if (paste) await unlink(path.join(DATA_DIR, `${slug}.json`)).catch(() => undefined);
      return "not-found";
    }
    return (await writePasteAtomically(slug, { ...paste, editable })) ? "updated" : "not-found";
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
