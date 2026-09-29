import "server-only";
import { couchRequest, clearPublicationCache, getPublishedNoteSource, getVcobsLink } from "@/lib/couch";
import { liveSyncChunks } from "@/lib/livesync-edit";
import { getExcalidrawData } from "@/lib/markdown";

const MAX_MARKDOWN_BYTES = 8 * 1024 * 1024;
type SaveResult = { kind: "saved"; revision: string } | { kind: "not-found" | "conflict" | "invalid" | "too-large" | "drawing" | "failed" };

export async function savePublishedNote(slug: string, markdown: string, revision: string): Promise<SaveResult> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(slug) || typeof markdown !== "string" || !/^[1-9]\d*-[a-zA-Z0-9]+$/.test(revision)) return { kind: "invalid" };
  if (Buffer.byteLength(markdown, "utf8") > MAX_MARKDOWN_BYTES) return { kind: "too-large" };
  if (getVcobsLink(markdown) !== slug) return { kind: "invalid" };
  if (getExcalidrawData(markdown)) return { kind: "drawing" };

  const current = await getPublishedNoteSource(slug);
  if (!current) return { kind: "not-found" };
  if (getExcalidrawData(current.markdown)) return { kind: "drawing" };
  if (current.note._conflicts?.length || current.note._rev !== revision) return { kind: "conflict" };
  if (current.markdown === markdown) return { kind: "saved", revision };

  const chunks = await liveSyncChunks(markdown);
  if (chunks.length) {
    const written = await couchRequest("/_bulk_docs", { method: "POST", body: JSON.stringify({ docs: chunks }) });
    if (!written.ok) return { kind: "failed" };
    const outcomes = await written.json() as Array<{ id?: string; ok?: boolean; error?: string }>;
    if (!Array.isArray(outcomes) || outcomes.length !== chunks.length) return { kind: "failed" };
    const collisions = outcomes.filter((result) => result.error === "conflict").map((result) => result.id);
    if (outcomes.some((result) => !result.ok && result.error !== "conflict") || collisions.some((id) => !id)) return { kind: "failed" };
    if (collisions.length) {
      const existing = await couchRequest("/_all_docs?include_docs=true", { method: "POST", body: JSON.stringify({ keys: collisions }) });
      if (!existing.ok) return { kind: "failed" };
      const result = await existing.json() as { rows: Array<{ id: string; doc?: { type?: string; data?: string } }> };
      const found = new Map(result.rows.map((row) => [row.id, row.doc]));
      if (chunks.some((chunk) => collisions.includes(chunk._id) && (found.get(chunk._id)?.type !== "leaf" || found.get(chunk._id)?.data !== chunk.data))) return { kind: "failed" };
    }
  }

  const next = { ...current.note, children: chunks.map((chunk) => chunk._id), mtime: Date.now(), size: Buffer.byteLength(markdown, "utf8"), eden: {} };
  delete next._conflicts;
  // Path IDs may contain slashes; _bulk_docs avoids CouchDB URL routing ambiguity.
  const response = await couchRequest("/_bulk_docs", { method: "POST", body: JSON.stringify({ docs: [next] }) });
  if (!response.ok) return { kind: "failed" };
  const [saved] = await response.json() as Array<{ ok?: boolean; rev?: string; error?: string }>;
  if (saved?.error === "conflict") return { kind: "conflict" };
  if (!saved.ok || !saved.rev) return { kind: "failed" };
  clearPublicationCache();
  return { kind: "saved", revision: saved.rev };
}
