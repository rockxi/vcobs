import "server-only";

export type CouchFile = {
  _id: string;
  _rev?: string;
  path: string;
  children: string[];
  ctime?: number;
  mtime?: number;
  size?: number;
  type: string;
  deleted?: boolean;
};

type Leaf = { _id: string; data: string; type: "leaf" };
type AllDocsResponse<T> = { rows: Array<{ id: string; doc?: T; error?: string }> };
type FindResponse<T> = { docs: T[]; bookmark?: string };

const config = {
  url: process.env.COUCHDB_URL?.replace(/\/$/, ""),
  database: process.env.COUCHDB_DATABASE,
  username: process.env.COUCHDB_USERNAME,
  password: process.env.COUCHDB_PASSWORD,
};

function databaseUrl(path = "") {
  if (!config.url || !config.database || !config.username || !config.password) {
    throw new Error("CouchDB is not configured. Fill in .env.local.");
  }
  return `${config.url}/${encodeURIComponent(config.database)}${path}`;
}

async function couchFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const credentials = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  const response = await fetch(databaseUrl(path), {
    ...init,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`CouchDB request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

async function getDocuments<T>(keys: string[]) {
  if (!keys.length) return [] as T[];
  const response = await couchFetch<AllDocsResponse<T>>("/_all_docs?include_docs=true", {
    method: "POST",
    body: JSON.stringify({ keys }),
  });
  return response.rows.flatMap((row) => (row.doc ? [row.doc] : []));
}

async function findMarkdownFiles(): Promise<CouchFile[]> {
  const files: CouchFile[] = [];
  let bookmark: string | undefined;
  let previousBookmark: string | undefined;

  while (true) {
    const result = await couchFetch<FindResponse<CouchFile>>("/_find", {
      method: "POST",
      body: JSON.stringify({
        selector: { type: { $in: ["plain", "newnote"] } },
        fields: ["_id", "_rev", "path", "children", "ctime", "mtime", "size", "type", "deleted"],
        limit: 500,
        bookmark,
      }),
    });
    files.push(...result.docs.filter((file) => !file.deleted && file.path?.toLowerCase().endsWith(".md")));
    // Mango may return a bookmark even after its last non-empty page. Do not loop forever.
    if (!result.docs.length || !result.bookmark || result.bookmark === previousBookmark) break;
    previousBookmark = result.bookmark;
    bookmark = result.bookmark;
  }

  return files;
}

async function getLeafData(ids: string[]) {
  const leaves = await getDocuments<Leaf>(ids);
  return new Map(leaves.map((leaf) => [leaf._id, leaf.data]));
}

export type PublicNote = CouchFile & { slug: string; topic?: string };

type PublicationIndex = {
  expiresAt: number;
  notes: Map<string, PublicNote>;
};

let publicationIndex: PublicationIndex | undefined;
const INDEX_TTL_MS = 60_000;

/** Reads only the first chunk: the publishing property must be in the opening frontmatter. */
async function buildPublicationIndex() {
  const files = await findMarkdownFiles();
  const firstChunkIds = [...new Set(files.map((file) => file.children[0]).filter(Boolean))];
  const leafData = new Map<string, string>();

  for (let offset = 0; offset < firstChunkIds.length; offset += 100) {
    const batch = await getLeafData(firstChunkIds.slice(offset, offset + 100));
    batch.forEach((value, key) => leafData.set(key, value));
  }

  // Frontmatter is normally entirely in the first leaf, but preserve correctness for
  // unusually long property blocks without loading complete note bodies.
  const frontmatterSources = new Map(files.map((file) => [file._id, leafData.get(file.children[0]) ?? ""]));
  for (let childIndex = 1; childIndex < 16; childIndex += 1) {
    const incomplete = files.filter((file) => {
      const source = frontmatterSources.get(file._id) ?? "";
      return /^---\r?\n/.test(source) && !/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(source) && Boolean(file.children[childIndex]);
    });
    if (!incomplete.length) break;
    const ids = [...new Set(incomplete.map((file) => file.children[childIndex]))];
    const nextLeaves = await getLeafData(ids);
    incomplete.forEach((file) => frontmatterSources.set(file._id, `${frontmatterSources.get(file._id) ?? ""}${nextLeaves.get(file.children[childIndex]) ?? ""}`));
  }

  const notes = new Map<string, PublicNote>();
  const collisions = new Set<string>();
  for (const file of files) {
    const source = frontmatterSources.get(file._id) ?? "";
    const slug = getVcobsLink(source);
    if (!slug) continue;
    if (notes.has(slug)) {
      notes.delete(slug);
      collisions.add(slug);
      continue;
    }
    if (!collisions.has(slug)) {
      const topic = getVcobsTopic(source);
      notes.set(slug, { ...file, slug, ...(topic ? { topic } : {}) });
    }
  }

  publicationIndex = { notes, expiresAt: Date.now() + INDEX_TTL_MS };
  return publicationIndex;
}

async function getPublicationIndex() {
  if (publicationIndex && publicationIndex.expiresAt > Date.now()) return publicationIndex;
  return buildPublicationIndex();
}

export function getVcobsLink(chunk: string) {
  const frontmatter = chunk.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) return null;
  const match = frontmatter[1].match(/^\s*vcobs-link\s*(?:=|:)\s*["']?([a-zA-Z0-9][a-zA-Z0-9_-]{0,127})["']?\s*$/m);
  return match?.[1] ?? null;
}

export function getVcobsTopic(chunk: string) {
  const frontmatter = chunk.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) return null;
  const match = frontmatter[1].match(/^\s*vcobs-topic\s*(?:=|:)\s*(.*?)\s*$/m);
  if (!match) return null;
  const topic = match[1].trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  return topic && topic.length <= 128 ? topic : null;
}

export function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export async function getPublicNote(slug: string) {
  const index = await getPublicationIndex();
  const note = index.notes.get(slug);
  if (!note) return null;
  const chunks = await getLeafData(note.children);
  const markdown = note.children.map((id) => chunks.get(id) ?? "").join("");
  if (getVcobsLink(markdown) !== slug) return null;
  return { ...note, markdown: stripFrontmatter(markdown) };
}

export async function getPublicNotes() {
  const index = await getPublicationIndex();
  return [...index.notes.values()].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
}

export async function getFile(path: string) {
  const [file] = await getDocuments<CouchFile>([path.toLocaleLowerCase()]);
  if (!file || file.deleted) return null;
  const chunks = await getLeafData(file.children);
  const parts = file.children.map((id) => chunks.get(id) ?? "");
  // Live Sync stores every binary chunk as a separately padded Base64 string.
  // Decode parts before joining; concatenating Base64 strings corrupts data after the first '=' padding.
  const data = file.path.toLowerCase().endsWith(".md")
    ? parts.join("")
    : Buffer.concat(parts.map((part) => Buffer.from(part, "base64"))).toString("base64");
  return { file, data };
}

/** Obsidian embeds may refer to an attachment by basename while it lives elsewhere in the vault. */
export async function getFileByName(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const response = await couchFetch<FindResponse<CouchFile>>("/_find", {
    method: "POST",
    body: JSON.stringify({
      selector: { path: { $regex: `${escapedName}$` } },
      fields: ["_id", "path", "children", "ctime", "mtime", "size", "type", "deleted"],
      limit: 5,
    }),
  });
  const file = response.docs.find((candidate) => !candidate.deleted && candidate.path?.toLowerCase().endsWith(name.toLowerCase()));
  if (!file) return null;
  const chunks = await getLeafData(file.children);
  const parts = file.children.map((id) => chunks.get(id) ?? "");
  const data = file.path.toLowerCase().endsWith(".md")
    ? parts.join("")
    : Buffer.concat(parts.map((part) => Buffer.from(part, "base64"))).toString("base64");
  return { file, data };
}

export function clearPublicationCache() {
  publicationIndex = undefined;
}
