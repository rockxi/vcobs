"use client";

import { useState } from "react";

const MAX_PASTE_LENGTH = 1_000_000;

export function EditablePaste({ slug, initialText }: { slug: string; initialText: string }) {
  const [text, setText] = useState(initialText);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function save() {
    setState("saving"); setMessage("");
    try {
      const response = await fetch(`/api/pastes/${slug}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Не удалось сохранить текст.");
      setState("saved"); setMessage("Сохранено.");
    } catch (error) {
      setState("error"); setMessage(error instanceof Error ? error.message : "Не удалось сохранить текст.");
    }
  }

  return <section className="editable-paste">
    <label htmlFor="editable-paste-text">Текст заметки</label>
    <textarea id="editable-paste-text" maxLength={MAX_PASTE_LENGTH} onChange={(event) => { setText(event.target.value); setState("idle"); setMessage(""); }} rows={16} value={text} />
    <div className="editable-paste-actions"><span>{text.length.toLocaleString("ru-RU")} / 1 000 000</span><button disabled={state === "saving" || !text.trim()} onClick={save} type="button">{state === "saving" ? "Сохраняем…" : "Сохранить"}</button></div>
    {message && <p className={state === "error" ? "form-error" : "save-success"} role={state === "error" ? "alert" : "status"}>{message}</p>}
  </section>;
}
