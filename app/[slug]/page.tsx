import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { ExcalidrawViewer } from "@/components/excalidraw-viewer";
import { getFile, getFileByName, getPublicNote, getPublicNotes } from "@/lib/couch";
import { getPaste } from "@/lib/pastes";
import { getExcalidrawData, getExcalidrawEmbeddedFiles, mediaType, prepareMarkdown, resolveVaultPath } from "@/lib/markdown";
import { VaultTree } from "@/components/vault-tree";

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
      <article className="note-paper paste-paper"><div className="note-context"><span>Удалится через 24 часа</span><time>Создано {created}</time></div><pre className="paste-content">{paste.text}</pre></article>
      <footer className="reader-footer"><Link href="/">Создать свою ссылку</Link> <span>·</span> vcobs</footer>
    </main>;
  }

  const title = note.markdown.match(/^#\s+(.+)$/m)?.[1] ?? note.path.split("/").at(-1)?.replace(/\.md$/i, "") ?? slug;
  const pathParts = note.path.replace(/\.md$/i, "").split("/").filter(Boolean);
  const renderedMarkdown = prepareMarkdown(note.markdown, slug).replace(/^#\s+.+(?:\r?\n)+/, "");
  const notes = await getPublicNotes();
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
    <div className={`vault-layout${drawing ? " vault-layout-drawing" : ""}`}>
      <VaultTree notes={notes} activeSlug={slug} />
      <main className={`reader-shell${drawing ? " reader-shell-drawing" : ""}`}>
      <header className="reader-header">
        <Link className="back-link" href="/" aria-label="Все опубликованные заметки">⌕ <span>Все заметки</span></Link>
        <span className="public-badge"><i /> опубликовано</span>
      </header>
      <article className={`note-paper${drawing ? " note-paper-drawing" : ""}`}>
        {!drawing && <>
          <nav className="note-breadcrumbs" aria-label="Путь к заметке">
            <Link href="/" aria-label="Главная">⌂</Link>
            {pathParts.map((part, index) => <span key={`${part}-${index}`}><i>›</i><b>{part}</b></span>)}
          </nav>
          <div className="note-masthead">
            <span className="note-document-icon" aria-hidden="true">▤</span>
            <div><h1>{title}</h1><p>{formatDate(note.mtime) ? `Обновлено ${formatDate(note.mtime)}` : "Опубликованная заметка"} <i /> Опубликовано</p></div>
          </div>
        </>}
        {drawing ? <ExcalidrawViewer data={drawing} /> : (
          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderedMarkdown}</ReactMarkdown>
          </div>
        )}
      </article>
      <footer className="reader-footer">{title} <span>·</span> vcobs</footer>
      </main>
    </div>
  );
}
