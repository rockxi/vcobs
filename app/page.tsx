import Link from "next/link";
import { getPublicNotes } from "@/lib/couch";
import { PasteForm } from "@/components/paste-form";

// CouchDB credentials exist only at container runtime, never while the image builds.
export const dynamic = "force-dynamic";

function formatDate(timestamp?: number) {
  return timestamp ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(timestamp) : "—";
}

export default async function HomePage() {
  const notes = await getPublicNotes();
  return (
    <main className="library-shell">
      <section className="library-hero">
        <span className="brand-mark">v</span>
        <div>
          <p className="eyebrow">vcobs / public vault</p>
          <h1>Опубликованные заметки</h1>
          <p className="hero-copy">Только заметки с <code>vcobs-link</code> в свойствах Obsidian.</p>
        </div>
      </section>
      <section className="paste-section">
        <div className="paste-intro"><p className="eyebrow">quick share</p><h2>Вставьте текст — получите ссылку</h2><p>Подойдёт для заметок и логов. Текст и ссылка автоматически удалятся через 24 часа.</p></div>
        <PasteForm />
      </section>
      <section className="note-grid" aria-label="Опубликованные заметки">
        {notes.map((note) => (
          <Link className="note-card" href={`/${note.slug}`} key={note.slug}>
            <span className="note-card-icon">↗</span>
            <p className="note-card-path">{note.path}</p>
            <h2>{note.path.split("/").at(-1)?.replace(/\.md$/i, "")}</h2>
            <p className="note-card-meta">Обновлено {formatDate(note.mtime)}</p>
            <span className="note-card-slug">/{note.slug}</span>
          </Link>
        ))}
        {!notes.length && (
          <div className="empty-state">
            <span>✦</span>
            <h2>Пока нет опубликованных заметок</h2>
            <p>Добавьте в начало Markdown-файла блок свойств с <code>vcobs-link = my-note</code>.</p>
          </div>
        )}
      </section>
    </main>
  );
}
