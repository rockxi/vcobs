import { randomBytes } from "node:crypto";
import { access, mkdir, open, readdir, readFile, rename, stat, unlink, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_SHARED_FILE_BYTES = 500 * 1024 * 1024;
export const SHARED_FILE_TTL_MS = 12 * 60 * 60 * 1000;

const DATA_DIR = process.env.SHARED_FILES_DATA_DIR ?? path.join(process.cwd(), "data", "files");
const SLUG_PATTERN = /^[a-zA-Z0-9_-]{8,32}$/;
const DEFAULT_CONTENT_TYPE = "application/octet-stream";
const ARTIFACT_EXTENSIONS = [".lock", ".bin.part", ".json.part"] as const;
const STORED_EXTENSIONS = [".bin", ".json"] as const;
type SharedFileExtension = (typeof ARTIFACT_EXTENSIONS)[number] | (typeof STORED_EXTENSIONS)[number];

export class SharedFileTooLargeError extends Error {
  constructor() {
    super("Файл больше 500 МБ.");
  }
}

export type SharedFile = {
  slug: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
  path: string;
};

type StoredSharedFile = Omit<SharedFile, "slug" | "path">;
type StoreOptions = {
  stream: ReadableStream<Uint8Array>;
  fileName?: string | null;
  contentType?: string | null;
  /** Test-only override; production callers use the exported 500 MiB limit. */
  maxBytes?: number;
};

function dataPath(slug: string, extension: SharedFileExtension) {
  return path.join(DATA_DIR, `${slug}${extension}`);
}

function isExpired(file: StoredSharedFile, now = Date.now()) {
  const createdAt = Date.parse(file.createdAt);
  return !Number.isFinite(createdAt) || now - createdAt >= SHARED_FILE_TTL_MS;
}

async function exists(filePath: string) {
  return access(filePath).then(() => true).catch(() => false);
}

async function removeFiles(slug: string) {
  await Promise.all([...STORED_EXTENSIONS, ...ARTIFACT_EXTENSIONS].map((extension) => unlink(dataPath(slug, extension)).catch(() => undefined)));
}

async function isStale(filePath: string, now: number) {
  try {
    return now - (await stat(filePath)).mtimeMs >= SHARED_FILE_TTL_MS;
  } catch {
    return false;
  }
}

export function sanitizeSharedFileName(value: string | null | undefined) {
  const baseName = (value ?? "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.trim() ?? "";
  const safeName = baseName
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+$/, "file")
    .slice(0, 120);
  return safeName || "file";
}

export function sanitizeSharedContentType(value: string | null | undefined) {
  const type = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type) ? type : DEFAULT_CONTENT_TYPE;
}

async function createReservedSlug() {
  await mkdir(DATA_DIR, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = randomBytes(12).toString("base64url");
    const lock = await open(dataPath(slug, ".lock"), "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") return null;
      throw error;
    });
    if (!lock) continue;
    await lock.close();
    if (await exists(dataPath(slug, ".bin")) || await exists(dataPath(slug, ".json"))) {
      await unlink(dataPath(slug, ".lock")).catch(() => undefined);
      continue;
    }
    return slug;
  }
  throw new Error("Could not allocate a shared file id.");
}

async function writeChunk(file: Awaited<ReturnType<typeof open>>, chunk: Uint8Array) {
  let offset = 0;
  while (offset < chunk.byteLength) {
    const { bytesWritten } = await file.write(chunk, offset, chunk.byteLength - offset, null);
    if (!bytesWritten) throw new Error("Could not write uploaded file.");
    offset += bytesWritten;
  }
}

export async function storeSharedFile({ stream, fileName, contentType, maxBytes = MAX_SHARED_FILE_BYTES }: StoreOptions): Promise<SharedFile> {
  const effectiveMaxBytes = Math.min(maxBytes, MAX_SHARED_FILE_BYTES);
  const slug = await createReservedSlug();
  const binPath = dataPath(slug, ".bin");
  const metadataPath = dataPath(slug, ".json");
  const partialBinPath = dataPath(slug, ".bin.part");
  const partialMetadataPath = dataPath(slug, ".json.part");
  let output: Awaited<ReturnType<typeof open>> | null = null;

  try {
    output = await open(partialBinPath, "wx", 0o600);
    let size = 0;
    let lastActivityAt = Date.now();
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > effectiveMaxBytes) throw new SharedFileTooLargeError();
        await writeChunk(output, value);
        if (Date.now() - lastActivityAt >= 60_000) {
          const activityTime = new Date();
          await utimes(dataPath(slug, ".lock"), activityTime, activityTime);
          lastActivityAt = activityTime.getTime();
        }
      }
    } catch (error) {
      await reader.cancel(error).catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
    await output.close();
    output = null;

    const metadata: StoredSharedFile = {
      fileName: sanitizeSharedFileName(fileName),
      contentType: sanitizeSharedContentType(contentType),
      size,
      createdAt: new Date().toISOString(),
    };
    await writeFile(partialMetadataPath, JSON.stringify(metadata), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(partialBinPath, binPath);
    await rename(partialMetadataPath, metadataPath);
    await unlink(dataPath(slug, ".lock"));
    return { slug, path: binPath, ...metadata };
  } catch (error) {
    if (output) await output.close().catch(() => undefined);
    await removeFiles(slug);
    throw error;
  }
}

export async function getSharedFile(slug: string, now = Date.now()): Promise<SharedFile | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const metadataPath = dataPath(slug, ".json");
  const binPath = dataPath(slug, ".bin");
  try {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as StoredSharedFile;
    if (
      typeof metadata.fileName !== "string" ||
      typeof metadata.contentType !== "string" ||
      typeof metadata.createdAt !== "string" ||
      !Number.isSafeInteger(metadata.size) ||
      metadata.size < 0 ||
      metadata.size > MAX_SHARED_FILE_BYTES ||
      metadata.fileName !== sanitizeSharedFileName(metadata.fileName) ||
      metadata.contentType !== sanitizeSharedContentType(metadata.contentType) ||
      isExpired(metadata, now)
    ) {
      await removeFiles(slug);
      return null;
    }
    const fileStats = await stat(binPath);
    if (!fileStats.isFile() || fileStats.size !== metadata.size) {
      await removeFiles(slug);
      return null;
    }
    return { slug, path: binPath, ...metadata };
  } catch {
    return null;
  }
}

export async function deleteExpiredSharedFiles(now = Date.now()) {
  await mkdir(DATA_DIR, { recursive: true });
  let deleted = 0;
  const groups = new Map<string, Set<SharedFileExtension>>();
  for (const file of await readdir(DATA_DIR)) {
    const match = file.match(/^([a-zA-Z0-9_-]{8,32})(\.bin|\.json|\.lock|\.bin\.part|\.json\.part)$/);
    if (!match) continue;
    const [, slug, extension] = match;
    const files = groups.get(slug) ?? new Set<SharedFileExtension>();
    files.add(extension as SharedFileExtension);
    groups.set(slug, files);
  }

  await Promise.all([...groups].map(async ([slug, files]) => {
    const hasMetadata = files.has(".json");
    const validFile = hasMetadata ? await getSharedFile(slug, now) : null;
    const markersAreFresh = await Promise.all(ARTIFACT_EXTENSIONS.filter((extension) => files.has(extension)).map(async (extension) => !(await isStale(dataPath(slug, extension), now))));
    if (markersAreFresh.some(Boolean)) return;

    const removeIfStale = async (extension: SharedFileExtension) => {
      if (!files.has(extension) || !(await isStale(dataPath(slug, extension), now))) return;
      await unlink(dataPath(slug, extension)).catch(() => undefined);
      deleted += 1;
    };
    await Promise.all(ARTIFACT_EXTENSIONS.map(removeIfStale));
    if (!validFile) await Promise.all(STORED_EXTENSIONS.map(removeIfStale));
  }));
  return deleted;
}
