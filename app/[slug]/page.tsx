import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { ExcalidrawViewer } from "@/components/excalidraw-viewer";
import { getFile, getFileByName, getPublicNote } from "@/lib/couch";
import { getPaste } from "@/lib/pastes";
import { getExcalidrawData, getExcalidrawEmbeddedFiles, mediaType, prepareMarkdown, resolveVaultPath } from "@/lib/markdown";

export const dynamic = "force-dynamic";

function formatDate(timestamp?: number) {
  if (!timestamp) return null;
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" }).format(timestamp);
}

export default async function NotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const note = await getPublicNote(slug);
  if (!note) {
    const paste = await getPaste(slug);
    if (!paste) notFound();
    const created = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" }).format(new Date(paste.createdAt));
    return <main className="reader-shell">
      <header className="reader-header"><Link className="back-link" href="/" aria-label="Создать новую вставку">← <span>vcobs</span></Link><span className="public-badge"><i /> по ссылке</span></header>
      <article className="note-paper paste-paper"><div className="note-context"><span>Текстовая вставка</span><time>Создано {created}</time></div><pre className="paste-content">{paste.text}</pre></article>
      <footer className="reader-footer"><Link href="/">Создать свою ссылку</Link> <span>·</span> vcobs</footer>
    </main>;
  }

  const title = note.markdown.match(/^#\s+(.+)$/m)?.[1] ?? note.path.split("/").at(-1)?.replace(/\.md$/i, "") ?? slug;
  const drawing = getExcalidrawData(note.markdown);
  if (drawing) {
    const embeddedFiles = await Promise.all(getExcalidrawEmbeddedFiles(note.markdown).map(async ({ id, reference }) => {
      const attachment = await getFile(resolveVaultPath(note.path, reference)) ?? await getFileByName(reference);
      if (!attachment) return null;
      const mimeType = mediaType(attachment.file.path);
      return [id, {
        id,
        mimeType,
        dataURL: `data:${mimeType};base64,${attachment.data}`,
        created: attachment.file.ctime ?? Date.now(),
      }] as const;
    }));
    drawing.files = Object.fromEntries(embeddedFiles.filter((file): file is NonNullable<typeof file> => file !== null)) as BinaryFiles;
  }
  return (
    <main className="reader-shell">
      <header className="reader-header">
        <Link className="back-link" href="/" aria-label="Все опубликованные заметки">← <span>vcobs</span></Link>
        <span className="public-badge"><i /> опубликовано</span>
      </header>
      <article className={`note-paper${drawing ? " note-paper-drawing" : ""}`}>
        <div className="note-context">
          <span>{note.path}</span>
          {formatDate(note.mtime) && <time>Обновлено {formatDate(note.mtime)}</time>}
        </div>
        {drawing ? <ExcalidrawViewer data={drawing} /> : (
          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{prepareMarkdown(note.markdown, slug)}</ReactMarkdown>
          </div>
        )}
      </article>
      <footer className="reader-footer">{title} <span>·</span> vcobs</footer>
    </main>
  );
}
