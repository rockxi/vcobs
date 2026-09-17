"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AdminPasteControlsProps = { slug: string; editable: boolean };

export function AdminPasteControls({ slug, editable: initialEditable }: AdminPasteControlsProps) {
  const router = useRouter();
  const [editable, setEditable] = useState(initialEditable);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState<"editability" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  async function responseError(response: Response) { const data = await response.json().catch(() => null) as { error?: unknown } | null; return typeof data?.error === "string" ? data.error : "Не удалось выполнить действие. Повторите попытку."; }
  async function toggleEditability() {
    if (pending || deleted) return;
    const nextEditable = !editable; setError(null); setPending("editability");
    try { const response = await fetch(`/api/admin/pastes/${encodeURIComponent(slug)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editable: nextEditable }) }); if (!response.ok) throw new Error(await responseError(response)); setEditable(nextEditable); router.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось изменить режим заметки."); } finally { setPending(null); }
  }
  async function deletePaste() {
    if (pending || deleted) return;
    setError(null); setPending("delete");
    try { const response = await fetch(`/api/admin/pastes/${encodeURIComponent(slug)}`, { method: "DELETE" }); if (!response.ok) throw new Error(await responseError(response)); setDeleted(true); router.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось удалить заметку."); setConfirmingDelete(false); } finally { setPending(null); }
  }
  if (deleted) return <p className="admin-action-message" role="status">Заметка удалена.</p>;
  const isPending = pending !== null;
  return <div className="admin-record-actions">
    <button type="button" onClick={toggleEditability} disabled={isPending} aria-label={editable ? `Сделать заметку ${slug} доступной только для чтения` : `Разрешить редактирование заметки ${slug}`}>{pending === "editability" ? "Сохраняем…" : editable ? "Только чтение" : "Разрешить редактирование"}</button>
    {!confirmingDelete ? <button type="button" className="admin-delete-button" onClick={() => { setError(null); setConfirmingDelete(true); }} disabled={isPending}>Удалить</button> : <div className="admin-delete-confirm" role="group" aria-label={`Подтверждение удаления заметки ${slug}`}><p>Удалить заметку без возможности восстановления?</p><div><button type="button" className="admin-delete-button" onClick={deletePaste} disabled={isPending}>{pending === "delete" ? "Удаляем…" : "Да, удалить"}</button><button type="button" onClick={() => setConfirmingDelete(false)} disabled={isPending}>Отмена</button></div></div>}
    {error && <p className="admin-action-error" role="alert">{error}</p>}
  </div>;
}
