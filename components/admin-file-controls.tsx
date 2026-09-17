"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AdminFileControlsProps = { slug: string; fileName: string };

const fallbackError = "Не удалось удалить файл. Повторите попытку.";

async function responseError(response: Response) {
  const data = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof data?.error === "string" ? data.error : fallbackError;
}

export function AdminFileControls({ slug, fileName }: AdminFileControlsProps) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  async function deleteFile() {
    if (pending || deleted) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/files/${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setDeleted(true);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallbackError);
      setConfirmingDelete(false);
    } finally {
      setPending(false);
    }
  }

  if (deleted) return <p className="admin-action-message" role="status">Файл удалён.</p>;

  return <div className="admin-record-actions">
    {!confirmingDelete ? (
      <button type="button" className="admin-delete-button" onClick={() => { setError(null); setConfirmingDelete(true); }} disabled={pending}>
        Удалить файл
      </button>
    ) : (
      <div className="admin-delete-confirm" role="group" aria-label={`Подтверждение удаления файла ${fileName}`}>
        <p>Удалить файл без возможности восстановления?</p>
        <div>
          <button type="button" className="admin-delete-button" onClick={deleteFile} disabled={pending}>
            {pending ? "Удаляем…" : "Да, удалить файл"}
          </button>
          <button type="button" onClick={() => setConfirmingDelete(false)} disabled={pending}>Отмена</button>
        </div>
      </div>
    )}
    {error && <p className="admin-action-error" role="alert">{error}</p>}
  </div>;
}
