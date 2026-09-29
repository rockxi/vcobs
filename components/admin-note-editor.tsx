"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LivePreviewEditor } from "@/components/live-preview-editor";

type Source = { markdown: string; revision: string; path: string; conflict: boolean };

export function AdminNoteEditor({ slug }: { slug: string }) {
  const router = useRouter();
  const [source, setSource] = useState<Source | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = source !== null && source.markdown !== text;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function openEditor() {
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch(`/api/admin/notes/${encodeURIComponent(slug)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось загрузить заметку.");
      setSource(body as Source); setText(body.markdown);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить заметку."); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!source || !dirty || busy || source.conflict) return;
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch(`/api/admin/notes/${encodeURIComponent(slug)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdown: text, revision: source.revision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось сохранить заметку.");
      setSource({ ...source, markdown: text, revision: body.revision });
      setSaved(true);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить заметку."); }
    finally { setBusy(false); }
  }

  function close() {
    if (dirty && !window.confirm("Есть несохранённые правки. Закрыть редактор?")) return;
    setSource(null); setText(""); setError(""); setSaved(false);
  }

  useEffect(() => {
    if (!source) return;
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });

  if (!source) return <div className="admin-note-entry"><button type="button" onClick={openEditor} disabled={busy}>{busy ? "Открываю…" : "Редактировать"}</button>{error && <p role="alert">{error}</p>}{saved && <p>Сохранено</p>}</div>;

  return <section className="admin-note-workspace" aria-label="Редактор опубликованной заметки">
    <header className="admin-note-toolbar">
      <div className="admin-note-ident"><strong>Редактор заметки</strong><span title={source.path}>{source.path}</span></div>
      <div className="admin-note-actions"><button type="button" onClick={close} disabled={busy}>Закрыть</button><button type="button" className="admin-note-save" onClick={() => void save()} disabled={!dirty || busy || source.conflict}>{busy ? "Сохраняю…" : "Сохранить"}</button></div>
    </header>
    {source.conflict && <p className="admin-note-warning" role="alert">У заметки уже есть конфликтующие версии в LiveSync. Разрешите конфликт в Obsidian перед редактированием здесь.</p>}
    {error && <p className="admin-note-warning" role="alert">{error}</p>}
    {saved && !dirty && <p className="admin-note-success" role="status">Сохранено в CouchDB. Obsidian получит изменение при следующей синхронизации.</p>}
    <LivePreviewEditor key={slug} documentId={slug} notePath={source.path} value={text} onChange={(value) => { setText(value); setSaved(false); }} ariaLabel="Редактировать опубликованную заметку" className="admin-note-live-editor" />
    <p className="admin-note-hint">Сохраняется весь Markdown вместе со свойствами. Свойство <code>vcobs-link</code> должно остаться неизменным. ⌘/Ctrl + S — сохранить.</p>
  </section>;
}
