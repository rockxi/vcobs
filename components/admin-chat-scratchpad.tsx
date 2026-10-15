"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/admin/chat/chat.module.css";

// This endpoint is independent of the Codex message/proxy API.
const endpoint = "/api/admin/chat-scratchpad";
async function request(method = "GET", text?: string) {
  const response = await fetch(endpoint, { method, cache: "no-store", signal: AbortSignal.timeout(16_000), ...(method === "PUT" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Не удалось сохранить поле.");
  return data;
}

export function AdminChatScratchpad() {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState("Загрузка…");
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState("");
  const latest = useRef("");
  const saved = useRef("");
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copyAttempt = useRef(0);
  const loadAttempt = useRef(0);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const attempt = ++loadAttempt.current;
    setError(""); setState("Загрузка…");
    try {
      const data = await request();
      if (!mounted.current || attempt !== loadAttempt.current) return;
      if (typeof data.text !== "string") throw new Error("Не удалось прочитать поле.");
      latest.current = data.text; saved.current = data.text;
      setText(data.text); setLoaded(true); setState("Сохранено");
    } catch (cause) { if (mounted.current && attempt === loadAttempt.current) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить поле."); setState("Не загружено"); } }
  }, []);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    if (saving.current || latest.current === saved.current) return;
    saving.current = true;
    setError(""); setState("Сохраняю…");
    try {
      // One request at a time: an older response can never overwrite a newer edit.
      while (latest.current !== saved.current) {
        const snapshot = latest.current;
        await request("PUT", snapshot);
        saved.current = snapshot;
      }
      if (mounted.current) setState("Сохранено");
    } catch (cause) {
      if (mounted.current) { setState("Не сохранено"); setError(cause instanceof Error ? cause.message : "Не удалось сохранить поле."); }
    } finally { saving.current = false; }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; loadAttempt.current += 1; clearTimeout(timer.current); };
  }, [load]);

  async function copy() {
    const attempt = ++copyAttempt.current;
    try {
      await navigator.clipboard.writeText(latest.current);
      if (mounted.current && attempt === copyAttempt.current) setCopyState("Скопировано");
    } catch {
      if (mounted.current && attempt === copyAttempt.current) setCopyState("Не удалось скопировать. Выделите текст и нажмите Ctrl/Cmd+C.");
    }
  }

  return <div className={styles.scratchpad}>
    <div className={styles.scratchpadControls}>
      <label htmlFor="admin-chat-scratchpad" className={styles.srOnly}>Личное поле администратора</label>
      <textarea id="admin-chat-scratchpad" rows={2} maxLength={1_000_000} disabled={!loaded} value={text} placeholder="Личное поле…" aria-describedby="admin-chat-scratchpad-status" onBlur={() => { if (loaded) void save(); }} onChange={(event) => {
        latest.current = event.target.value; setText(event.target.value); setCopyState(""); setError(""); setState("Не сохранено");
        clearTimeout(timer.current); timer.current = setTimeout(() => void save(), 650);
      }} />
      <button type="button" disabled={!loaded || !text} onClick={() => void copy()}>Скопировать</button>
    </div>
    <div id="admin-chat-scratchpad-status" className={styles.scratchpadStatus} role="status" aria-live="polite">
      <span>{error || copyState || state}</span>{error && <button type="button" onClick={() => void (loaded ? save() : load())}>Повторить</button>}
    </div>
  </div>;
}
