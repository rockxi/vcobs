"use client";
import { FormEvent, useState } from "react";

const MAX_PASTE_LENGTH = 1_000_000;

export function PasteForm() {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch("/api/pastes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Не удалось создать ссылку.");
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать ссылку."); setBusy(false);
    }
  }
  return <form className="paste-form" onSubmit={submit}>
    <label htmlFor="paste-text">Текст для публикации</label>
    <textarea id="paste-text" maxLength={MAX_PASTE_LENGTH} onChange={(event) => setText(event.target.value)} placeholder="Вставьте сюда текст…" required rows={10} value={text} />
    <div className="paste-actions"><span>{text.length.toLocaleString("ru-RU")} / 1 000 000</span><button disabled={busy || !text.trim()} type="submit">{busy ? "Создаём…" : "Создать ссылку"}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
