export type PreviewTokenKind =
  | "hide" | "bullet" | "ordered" | "checkbox-checked" | "checkbox-empty" | "rule" | "frontmatter-delimiter"
  | "heading-1" | "heading-2" | "heading-3" | "heading-4" | "heading-5" | "heading-6"
  | "bold" | "italic" | "strike" | "code" | "link" | "quote" | "code-block" | "fence" | "image" | "embed";

export type PreviewToken = { from: number; to: number; kind: PreviewTokenKind; text?: string };
export type PreviewContext = { fence: null | { marker: "`" | "~"; length: number }; frontmatter: boolean; atDocumentStart: boolean };
export type PreviewLine = { tokens: PreviewToken[]; context: PreviewContext };
export const initialPreviewContext: PreviewContext = { fence: null, frontmatter: false, atDocumentStart: true };

/** Source-relative visual ranges. Neither parsing nor presentation changes the document. */
export function parsePreviewLine(source: string, active: boolean, previous: PreviewContext = initialPreviewContext): PreviewLine {
  const tokens: PreviewToken[] = [];
  const add = (from: number, to: number, kind: PreviewTokenKind, text?: string) => {
    if (to > from) tokens.push({ from, to, kind, ...(text === undefined ? {} : { text }) });
  };
  const context: PreviewContext = { ...previous, atDocumentStart: false };
  if (previous.atDocumentStart && source.trim() === "---") {
    context.frontmatter = true;
    if (!active) add(0, source.length, "frontmatter-delimiter", "Properties");
    return { tokens, context };
  }
  if (previous.frontmatter) {
    if (/^(?:---|\.\.\.)\s*$/.test(source)) {
      context.frontmatter = false;
      if (!active) add(0, source.length, "frontmatter-delimiter", "");
    }
    return { tokens, context };
  }
  const fence = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(source);
  if (previous.fence) {
    const close = fence && fence[1][0] === previous.fence.marker && fence[1].length >= previous.fence.length && /^\s*$/.test(fence[2]);
    if (close) context.fence = null;
    if (!active) add(0, source.length, close ? "fence" : "code-block");
    return { tokens, context };
  }
  if (fence && !(fence[1][0] === "`" && fence[2].includes("`"))) {
    context.fence = { marker: fence[1][0] as "`" | "~", length: fence[1].length };
    if (!active) add(0, source.length, "fence");
    return { tokens, context };
  }
  if (active || !source) return { tokens, context };
  if (/^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(source)) {
    add(0, source.length, "rule");
    return { tokens, context };
  }

  let offset = 0;
  const heading = /^(#{1,6})\s+/.exec(source);
  if (heading) {
    add(0, heading[0].length, "hide");
    offset = heading[0].length;
    add(offset, source.length, `heading-${heading[1].length}` as PreviewTokenKind);
  } else {
    const quote = /^\s{0,3}>\s?/.exec(source);
    if (quote) {
      add(0, quote[0].length, "hide");
      offset = quote[0].length;
      add(offset, source.length, "quote");
    }
    const list = /^(\s*)([-+*]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/.exec(source.slice(offset));
    if (list) {
      const start = offset + list[1].length;
      const markerEnd = start + list[2].length + list[3].length;
      add(start, markerEnd, /^\d/.test(list[2]) ? "ordered" : "bullet", list[2] + " ");
      offset = markerEnd;
      if (list[4]) {
        add(offset, offset + list[4].length, /[xX]/.test(list[4]) ? "checkbox-checked" : "checkbox-empty");
        offset += list[4].length;
      }
    }
  }

  // Non-overlapping inline syntax; malformed delimiters remain literal source.
  const inline = /(\*\*|__)(?=\S)(.+?\S)\1|(?<!\*)\*(?=\S)(.+?\S)\*(?!\*)|(?<!_)_(?=\S)(.+?\S)_(?!_)|~~(?=\S)(.+?\S)~~|`([^`]+)`|!\[\[([^\]]+)\]\]|!\[([^\]]*)\]\(([^)\n]+)\)|(?<!!)\[([^\]]+)\]\(([^)\n]+)\)/g;
  inline.lastIndex = offset;
  for (const match of source.matchAll(inline)) {
    const start = match.index;
    if (start < offset) continue;
    const end = start + match[0].length;
    if (match[1]) {
      add(start, start + 2, "hide"); add(start + 2, end - 2, "bold"); add(end - 2, end, "hide");
    } else if (match[3] || match[4]) {
      add(start, start + 1, "hide"); add(start + 1, end - 1, "italic"); add(end - 1, end, "hide");
    } else if (match[5]) {
      add(start, start + 2, "hide"); add(start + 2, end - 2, "strike"); add(end - 2, end, "hide");
    } else if (match[6]) {
      add(start, start + 1, "hide"); add(start + 1, end - 1, "code"); add(end - 1, end, "hide");
    } else if (match[7]) {
      add(start, end, "embed", match[7].split("|")[0]);
    } else if (match[8] !== undefined) {
      add(start, end, "image", `${match[9].replace(/\s+"[^"]*"$/, "")}\n${match[8]}`);
    } else if (match[10]) {
      add(start, start + 1, "hide"); add(start + 1, start + 1 + match[10].length, "link");
      add(start + 1 + match[10].length, end, "hide");
    }
  }
  return { tokens: tokens.sort((a, b) => a.from - b.from || a.to - b.to), context };
}

const imageExtension = /\.(?:png|jpe?g|gif|webp|avif)$/i;

/** Every URL segment is encoded separately; traversal and unsupported media stay as a label. */
export function previewMediaUrl(notePath: string, reference: string, obsidianEmbed = false): string | null {
  const clean = reference.trim().replace(/^<|>$/g, "").split(/[?#]/, 1)[0];
  if (!clean || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(clean) || clean.includes("\\")) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(clean); } catch { return null; }
  const base = decoded.startsWith("/") ? [] : notePath.split("/").slice(0, -1);
  const parts = [...base];
  for (const part of decoded.replace(/^\//, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else if (part.includes("\0") || part === "_design") return null;
    else parts.push(part);
  }
  if (!parts.length || !imageExtension.test(parts.at(-1)!)) return null;
  const url = `/api/admin/vault/media/${parts.map(encodeURIComponent).join("/")}`;
  return obsidianEmbed && !decoded.includes("/") ? `${url}?obsidian=1` : url;
}

export type PreviewTableRow = { cells: string[]; header: boolean; separator: boolean };
export function splitPreviewTableRow(source: string): string[] | null {
  const trimmed = source.trim();
  if (!trimmed.includes("|")) return null;
  const body = trimmed.replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return body.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}
export function isPreviewTableSeparator(source: string): boolean {
  const cells = splitPreviewTableRow(source);
  return Boolean(cells && cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
}
export function previewTableRow(previous: string, current: string, next: string): PreviewTableRow | null {
  const cells = splitPreviewTableRow(current);
  if (!cells) return null;
  if (isPreviewTableSeparator(current)) {
    const headers = splitPreviewTableRow(previous);
    return headers && headers.length === cells.length && !isPreviewTableSeparator(previous) ? { cells, header: false, separator: true } : null;
  }
  const nextCells = splitPreviewTableRow(next);
  const header = Boolean(nextCells && nextCells.length === cells.length && isPreviewTableSeparator(next));
  const previousCells = splitPreviewTableRow(previous);
  const body = Boolean(previousCells && previousCells.length === cells.length && isPreviewTableSeparator(previous));
  if (!header && !body) return null;
  return { cells, header, separator: false };
}
