"use client";

import { useEffect, useRef, useState } from "react";

type CopyStatus = "idle" | "copied" | "error";

export function PasteCopyButton({ text }: { text: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function copyText() {
    if (resetTimer.current) clearTimeout(resetTimer.current);

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      resetTimer.current = setTimeout(() => setStatus("idle"), 2200);
    } catch {
      setStatus("error");
    }
  }

  const buttonLabel = status === "copied" ? "Скопировано" : status === "error" ? "Попробовать снова" : "Скопировать";

  return (
    <div className="paste-copy-control">
      <button type="button" className="paste-copy-button" onClick={copyText}>{buttonLabel}</button>
      <span className="paste-copy-status" aria-live="polite">
        {status === "copied" ? "Текст скопирован в буфер обмена." : status === "error" ? "Не удалось скопировать текст. Выделите его вручную." : ""}
      </span>
    </div>
  );
}
