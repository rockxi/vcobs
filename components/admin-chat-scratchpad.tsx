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
  const [pasting, setPasting] = useState(false);
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
    return () => { mounted.current = false; loadAttempt.current += 1; };
  }, [load]);

  async function copy() {
    const attempt = ++copyAttempt.current;
    try {
      await navigator.clipboard.writeText(latest.current);
      if (mounted.current && attempt === copyAttempt.current) setCopyState("Скопировано");
    } catch {
      if (mounted.current && attempt === copyAttempt.current) setCopyState("Не удалось скопировать. Разрешите доступ к буферу обмена и повторите.");
    }
  }

  async function paste() {
    setPasting(true);
    setCopyState("");
    setError("");
    try {
      const value = await navigator.clipboard.readText();
      if (!mounted.current) return;
      if (value.length > 1_000_000) throw new Error("Максимум 1 000 000 символов.");
      latest.current = value;
      setText(value);
      await save();
    } catch (cause) {
      if (mounted.current) setCopyState(cause instanceof Error && cause.message === "Максимум 1 000 000 символов." ? cause.message : "Не удалось вставить. Разрешите доступ к буферу обмена и повторите.");
    } finally {
      if (mounted.current) setPasting(false);
    }
  }

  return <div className={styles.scratchpad}>
    <div className={styles.scratchpadControls}>
      <button type="button" disabled={!loaded || pasting} title="Вставить из буфера обмена" aria-label="Вставить из буфера обмена" aria-describedby="admin-chat-scratchpad-status" onClick={() => void paste()}>В</button>
      <button type="button" disabled={!loaded || !text || pasting} title="Скопировать" aria-label="Скопировать" onClick={() => void copy()}>С</button>
    </div>
    <div id="admin-chat-scratchpad-status" className={styles.scratchpadStatus} role="status" aria-live="polite">
      <span>{error || copyState || state}</span>{error && <button type="button" onClick={() => void (loaded ? save() : load())}>Повторить</button>}
    </div>
  </div>;
}
