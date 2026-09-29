"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminVaultTree, type VaultEntry } from "@/components/admin-vault-tree";
import { LivePreviewEditor, type LivePreviewEditorRef } from "@/components/live-preview-editor";

type VaultSource = VaultEntry & { markdown: string; revision: string; conflict: boolean };
const urlFor = (id: string) => `/api/admin/vault/${id.split("/").map(encodeURIComponent).join("/")}`;

export function AdminVaultWorkspace() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [listError, setListError] = useState("");
  const [source, setSource] = useState<VaultSource | null>(null);
  const [text, setText] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const editorRef = useRef<LivePreviewEditorRef>(null);
  const requestRef = useRef(0);
  const dirty = Boolean(source && source.markdown !== text);

  const loadList = useCallback(async () => {
    setListState("loading"); setListError("");
    try {
      const response = await fetch("/api/admin/vault", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Не удалось загрузить файлы.");
      setEntries(body.notes); setListState("ready");
    } catch (cause) { setListError(cause instanceof Error ? cause.message : "Не удалось загрузить файлы."); setListState("error"); }
  }, []);
  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function select(entry: VaultEntry) {
    if (entry.id === source?.id || loadingId || saving) return;
    if (dirty && !window.confirm("Есть несохранённые правки. Перейти к другой заметке?")) return;
    const request = ++requestRef.current;
    setLoadingId(entry.id); setError(""); setSaved(false);
    try {
      const response = await fetch(urlFor(entry.id), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Не удалось открыть заметку.");
      if (request !== requestRef.current) return;
      setSource(body); setText(body.markdown);
      if (window.innerWidth <= 760) setSidebarOpen(false);
      requestAnimationFrame(() => editorRef.current?.focus());
    } catch (cause) { if (request === requestRef.current) setError(cause instanceof Error ? cause.message : "Не удалось открыть заметку."); }
    finally { if (request === requestRef.current) setLoadingId(null); }
  }

  async function save() {
    if (!source || !dirty || saving || source.conflict) return;
    const savedText = text;
    setSaving(true); setError(""); setSaved(false);
    try {
      const response = await fetch(urlFor(source.id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdown: savedText, revision: source.revision }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Не удалось сохранить заметку.");
      setSource((current) => current?.id === source.id ? { ...current, markdown: savedText, revision: body.revision } : current);
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить заметку."); }
    finally { setSaving(false); }
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const handle = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveRef.current(); } };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  return <main className="admin-vault-layout">
    <aside className={`admin-vault-sidebar${sidebarOpen ? "" : " is-collapsed"}`} aria-label="Проводник заметок">
      <div className="admin-vault-brand"><a href="/admin" aria-label="Панель управления">vcobs <span>／ редактор</span></a><button type="button" onClick={() => setSidebarOpen(false)} aria-label="Скрыть проводник">‹</button></div>
      {listState === "loading" && <p className="admin-vault-tree-empty" role="status">Загружаю файлы…</p>}
      {listState === "error" && <div className="admin-vault-tree-empty" role="alert"><p>{listError}</p><button type="button" onClick={() => void loadList()}>Повторить</button></div>}
      {listState === "ready" && <AdminVaultTree entries={entries} activeId={source?.id ?? null} onSelect={(entry) => void select(entry)} />}
    </aside>
    <section className="admin-vault-main" aria-label="Редактор заметок">
      <header className="admin-vault-toolbar">
        <div className="admin-vault-title"><button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? "Скрыть проводник" : "Показать проводник"} aria-expanded={sidebarOpen}>☰</button><div><span className="admin-vault-kicker">Редактор заметок</span><h1>{source ? source.path.split("/").at(-1)?.replace(/\.md$/i, "") : "Хранилище"}</h1></div></div>
        <div className="admin-vault-actions"><span className="admin-vault-status" role="status">{saving ? "Сохраняю…" : dirty ? "Есть несохранённые правки" : saved ? "Сохранено" : source ? "Без изменений" : ""}</span><button type="button" onClick={() => void save()} disabled={!dirty || saving || Boolean(source?.conflict)}>Сохранить <kbd>⌘ S</kbd></button></div>
      </header>
      {error && <p className="admin-note-warning" role="alert">{error}</p>}
      {source?.conflict && <p className="admin-note-warning" role="alert">У заметки есть конфликтующие версии в LiveSync. Разрешите конфликт в Obsidian перед сохранением.</p>}
      {loadingId ? <div className="admin-vault-placeholder" role="status">Открываю заметку…</div> : source ? <div className="admin-vault-document"><p className="admin-vault-path">{source.path}</p>{/\.excalidraw\.md$/i.test(source.path) && <p className="admin-vault-path">Файл Excalidraw открыт как Markdown. Рисунок здесь не отображается.</p>}<LivePreviewEditor key={source.id} documentId={source.id} notePath={source.path} ref={editorRef} value={text} onChange={(value) => { setText(value); setSaved(false); }} ariaLabel={`Редактировать ${source.path}`} className="admin-vault-editor" /></div> : <div className="admin-vault-placeholder">Выберите заметку в проводнике слева.</div>}
    </section>
  </main>;
}
