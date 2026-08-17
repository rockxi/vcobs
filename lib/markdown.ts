import path from "node:path";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { decompressFromBase64 } from "lz-string";

function isExternal(url: string) {
  return /^(?:https?:|data:|mailto:|#)/i.test(url);
}

function mediaUrl(slug: string, file: string) {
  return `/api/media/${encodeURIComponent(slug)}?file=${encodeURIComponent(file)}`;
}

/** Converts Obsidian embeds and ordinary relative images to protected vcobs media URLs. */
export function prepareMarkdown(markdown: string, slug: string) {
  return markdown
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_match, file: string, alt?: string) => {
      return `![${alt || path.basename(file)}](${mediaUrl(slug, file)})`;
    })
    .replace(/!\[([^\]]*)\]\(([^ )]+)(?:\s+"[^"]*")?\)/g, (match, alt: string, file: string) => {
      return isExternal(file) || file.startsWith("/api/media/") ? match : `![${alt}](${mediaUrl(slug, file)})`;
    });
}

export function referencedMedia(markdown: string) {
  const files = new Set<string>();
  for (const match of markdown.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) files.add(match[1]);
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^ )]+)(?:\s+"[^"]*")?\)/g)) {
    if (!isExternal(match[1])) files.add(match[1]);
  }
  return files;
}

export function resolveVaultPath(notePath: string, reference: string) {
  const cleaned = decodeURIComponent(reference).replace(/^\//, "");
  return path.posix.normalize(path.posix.join(path.posix.dirname(notePath), cleaned));
}

export function mediaType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
    ".svg": "image/svg+xml", ".pdf": "application/pdf", ".mp3": "audio/mpeg", ".mp4": "video/mp4",
  } as Record<string, string>)[extension] ?? "application/octet-stream";
}

export function getExcalidrawData(markdown: string): ExcalidrawInitialDataState | null {
  const drawing = markdown.match(/^#{1,6}\s+Drawing\s*\r?\n```(json|compressed-json)?\s*\r?\n([\s\S]*?)\r?\n```/im);
  const source = drawing?.[2] ?? (markdown.trimStart().startsWith("{") ? markdown : null);
  const raw = drawing?.[1] === "compressed-json" ? decompressFromBase64(source?.replace(/\s/g, "") ?? "") : source;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ExcalidrawInitialDataState;
    return Array.isArray(parsed.elements) ? parsed : null;
  } catch {
    return null;
  }
}

export function getExcalidrawEmbeddedFiles(markdown: string) {
  const section = markdown.match(/^#{1,6}\s+Embedded Files\s*\r?\n([\s\S]*?)(?=^%%\s*$|^#{1,6}\s+Drawing\s*$|(?![\s\S]))/im);
  if (!section) return [];
  return [...section[1].matchAll(/^([a-z0-9]+):\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gim)]
    .map((match) => ({ id: match[1], reference: match[2] }));
}
