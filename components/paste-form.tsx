"use client";
import { FormEvent, useRef, useState } from "react";
import { encodeUploadFileName, formatSharedFileSize, isSharedFileSizeAllowed, MAX_SHARED_FILE_BYTES } from "@/components/file-share-utils";

const MAX_PASTE_LENGTH = 1_000_000;
type ShareMode = "text" | "file";

type FileUploadResult = { url?: string; error?: string };

function uploadFile(file: File, onProgress: (progress: number | null) => void) {
  return new Promise<FileUploadResult>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/files");
    request.setRequestHeader("X-File-Name", encodeUploadFileName(file.name));
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => onProgress(event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null);
    request.onerror = () => reject(new Error("Не удалось загрузить файл."));
    request.onload = () => {
      let result: FileUploadResult = {};
      try { result = JSON.parse(request.responseText) as FileUploadResult; } catch { /* Response is handled below. */ }
      if (request.status < 200 || request.status >= 300 || !result.url) {
        reject(new Error(result.error ?? "Не удалось загрузить файл."));
        return;
      }
      resolve(result);
    };
    request.send(file);
  });
}

export function PasteForm() {
  const [mode, setMode] = useState<ShareMode>("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function selectMode(nextMode: ShareMode) {
    setMode(nextMode);
    setError("");
    setProgress(null);
  }

  function chooseFile(nextFile: File | null) {
    setError("");
    setProgress(null);
    if (nextFile && !isSharedFileSizeAllowed(nextFile.size)) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setError("Выберите файл размером до 500 МБ.");
      return;
    }
    setFile(nextFile);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true); setProgress(null);
    try {
      if (mode === "file") {
        if (!file) throw new Error("Выберите файл.");
        if (!isSharedFileSizeAllowed(file.size)) throw new Error("Выберите файл размером до 500 МБ.");
        const result = await uploadFile(file, setProgress);
        window.location.assign(result.url!);
        return;
      }
      const response = await fetch("/api/pastes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Не удалось создать ссылку.");
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать ссылку."); setBusy(false); setProgress(null);
    }
  }
  return <form className="paste-form" onSubmit={submit}>
    <div className="share-mode-switcher" aria-label="Что отправить">
      <button aria-pressed={mode === "text"} className="share-mode-button" disabled={busy} onClick={() => selectMode("text")} type="button">Текст</button>
      <button aria-pressed={mode === "file"} className="share-mode-button" disabled={busy} onClick={() => selectMode("file")} type="button">Файл до 500 МБ</button>
    </div>
    {mode === "text" ? <>
      <label htmlFor="paste-text">Текст для публикации</label>
      <textarea id="paste-text" maxLength={MAX_PASTE_LENGTH} onChange={(event) => setText(event.target.value)} placeholder="Вставьте сюда текст…" required rows={10} value={text} />
    </> : <div className="file-share-picker">
      <label htmlFor="share-file">Файл для временной ссылки</label>
      <input ref={fileInput} id="share-file" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} type="file" />
      <p>До {formatSharedFileSize(MAX_SHARED_FILE_BYTES)}. Файл удалится через 12 часов.</p>
      {file && <div className="selected-file"><span><b>{file.name}</b><small>{formatSharedFileSize(file.size)}</small></span><button disabled={busy} onClick={() => chooseFile(null)} type="button">Убрать</button></div>}
    </div>}
    <div className="paste-actions"><span>{mode === "text" ? `${text.length.toLocaleString("ru-RU")} / 1 000 000` : file ? `${file.name} · ${formatSharedFileSize(file.size)}` : "Выберите файл"}</span><button disabled={busy || (mode === "text" ? !text.trim() : !file)} type="submit">{busy ? mode === "file" ? "Загружаем…" : "Создаём…" : "Создать ссылку"}</button></div>
    {busy && mode === "file" && <div className="file-upload-progress" aria-live="polite">{progress === null ? "Загружаем файл…" : <><progress max="100" value={progress} /> Загружено {progress}%</>}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
