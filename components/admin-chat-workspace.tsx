"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { canSendChat, chatDrawerTabTarget, chooseChatModel, recoverFailedChatLogin, safeDeviceLoginUrl, type Chat, type ChatMessage, type ChatModel, type ChatStatus } from "@/lib/admin-chat-state";
import styles from "@/app/admin/chat/chat.module.css";

async function api<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(16_000);
  const response = await fetch(`/api/admin/chat/${path}`, { method, headers: method === "POST" ? { "Content-Type": "application/json" } : undefined, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined, signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: "no-store" });
  let result;
  try { result = await response.json(); } catch { throw new Error("Не удалось прочитать ответ сервера. Обновите соединение."); }
  if (!response.ok) throw new Error(response.status === 401 ? "Сессия администратора завершилась. Войдите снова через панель управления." : result.error || "Не удалось выполнить запрос.");
  return result as T;
}
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "Не удалось связаться с сервером.";

export function AdminChatWorkspace() {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [model, setModel] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ chat: Chat; messages: ChatMessage[]; status: string; error?: string | null } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [loading, setLoading] = useState(true);
  const activeRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const statusRef = useRef<ChatStatus | null>(null);
  const detailRequest = useRef(0);
  const drawerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerOpen = mobile && sidebarOpen;
  const text = drafts[activeId ?? "new"] ?? "";
  const running = detail?.status === "running" || detail?.chat.status === "running";

  const refresh = useCallback(async () => {
    const [rawConnection, list] = await Promise.all([api<ChatStatus>("status"), api<{ chats: Chat[] }>("chats")]);
    const connection = recoverFailedChatLogin(rawConnection);
    setStatus(connection); statusRef.current = connection; setChats(list.chats);
    if (connection.ready) {
      const result = await api<{ models: ChatModel[] }>("models");
      setModels(result.models); setModel((current) => chooseChatModel(result.models, current));
    } else { setModels([]); setModel(""); }
    setPollError(""); setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { if (!cancelled) await refresh(); }
      catch (cause) { if (!cancelled) { setPollError(errorText(cause)); setLoading(false); } }
      if (!cancelled) timer = setTimeout(poll, statusRef.current?.login ? 2500 : 6000);
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [refresh]);

  const refreshDetail = useCallback(async (id: string, signal?: AbortSignal) => {
    const request = ++detailRequest.current;
    const result = await api<NonNullable<typeof detail>>(`chats/${encodeURIComponent(id)}`, "GET", undefined, signal);
    if (activeRef.current === id && request === detailRequest.current && !signal?.aborted) { setDetail(result); setPollError(""); }
    return result;
  }, []);

  useEffect(() => {
    activeRef.current = activeId;
    setDetail(null); nearBottom.current = true;
    if (!activeId) return;
    const id = activeId;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let delay = 6000;
      try { const result = await refreshDetail(id, controller.signal); delay = result.status === "running" || result.chat.status === "running" ? 1200 : 5000; }
      catch (cause) { if (!controller.signal.aborted) setPollError(errorText(cause)); }
      if (!controller.signal.aborted) timer = setTimeout(poll, delay);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [activeId, refreshDetail]);

  useEffect(() => {
    if (nearBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [detail]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => {
      setMobile(media.matches);
      if (!media.matches) setSidebarOpen(false);
      else if (drawerRef.current?.contains(document.activeElement)) requestAnimationFrame(() => menuRef.current?.focus());
    };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobileDrawerOpen || !drawerRef.current) return;
    const drawer = drawerRef.current;
    const focusable = () => Array.from(drawer.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
    const focusFirst = () => (focusable()[0] ?? drawer).focus();
    focusFirst();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setSidebarOpen(false); return; }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const target = chatDrawerTabTarget(elements.indexOf(document.activeElement as HTMLElement), elements.length, event.shiftKey);
      if (!elements.length) { event.preventDefault(); drawer.focus(); }
      else if (target !== null) { event.preventDefault(); elements[target].focus(); }
    };
    const focusin = (event: FocusEvent) => { if (!drawer.contains(event.target as Node)) focusFirst(); };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focusin);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", focusin);
      // On desktop resize keep focus in the regular sidebar, avoiding its hidden close button.
      if (window.matchMedia("(max-width: 760px)").matches) menuRef.current?.focus();
      else if (drawer.contains(document.activeElement) && !(document.activeElement as HTMLElement).getClientRects().length) focusFirst();
    };
  }, [mobileDrawerOpen]);

  function selectChat(id: string | null) { activeRef.current = id; setActiveId(id); setError(""); setSidebarOpen(false); }
  async function createChat() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ chat: Chat }>("chats", "POST");
      setChats((current) => [result.chat, ...current.filter((chat) => chat.id !== result.chat.id)]);
      selectChat(result.chat.id);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!canSendChat(status, model, text, running, busy) || (activeId && !detail)) return;
    const sentText = text;
    const draftKey = activeId ?? "new";
    setBusy(true); setError(""); nearBottom.current = true;
    let id = activeId;
    try {
      if (!id) {
        const result = await api<{ chat: Chat }>("chats", "POST");
        id = result.chat.id;
        setChats((current) => [result.chat, ...current]);
        // Preserve the draft if a subsequent send fails.
        setDrafts((current) => ({ ...current, [id!]: sentText }));
        selectChat(id);
      }
      await api(`chats/${encodeURIComponent(id)}/messages`, "POST", { text: sentText, model });
      setDrafts((current) => ({ ...current, [draftKey]: current[draftKey] === sentText ? "" : current[draftKey] ?? "", [id!]: current[id!] === sentText ? "" : current[id!] ?? "" }));
      await refreshDetail(id);
      await refresh();
      inputRef.current?.focus();
    } catch (cause) {
      setError(`${errorText(cause)} Перед повторной отправкой проверьте, появилось ли сообщение в истории.`);
      if (id) void refreshDetail(id).catch(() => {});
    } finally { setBusy(false); }
  }
  async function stop() {
    if (!activeId || busy) return;
    setBusy(true); setError("");
    try { await api(`chats/${encodeURIComponent(activeId)}/stop`, "POST"); await refreshDetail(activeId); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function authenticate(action: "login" | "logout") {
    if (busy) return;
    setBusy(true); setError("");
    try { await api(action, "POST"); await refresh(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  const loginUrl = status?.login ? safeDeviceLoginUrl(status.login.verificationUrl) : null;
  const connectionLabel = loading ? "Проверяю подключение…" : status?.ready ? "ChatGPT подключён" : status?.login ? "Ожидается вход в ChatGPT" : "ChatGPT не подключён";

  return <main className={styles.workspace}>
    <aside ref={drawerRef} className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`} aria-label="История чатов" role={mobileDrawerOpen ? "dialog" : undefined} aria-modal={mobileDrawerOpen || undefined} tabIndex={mobileDrawerOpen ? -1 : undefined}>
      <div className={styles.sidebarHeader}><a href="/admin" className={styles.brand}>vcobs <span>／ Codex</span></a><button className={styles.mobileClose} onClick={() => setSidebarOpen(false)} aria-label="Закрыть список чатов">×</button></div>
      <button className={styles.newChat} onClick={() => void createChat()} disabled={busy || !status?.configured}><span aria-hidden="true">＋</span> Новый чат</button>
      <nav className={styles.chatList} aria-label="Чаты">{chats.map((chat) => <button key={chat.id} className={`${styles.chatItem} ${activeId === chat.id ? styles.selected : ""}`} aria-current={activeId === chat.id ? "page" : undefined} onClick={() => selectChat(chat.id)} title={chat.title}><span>{chat.title || "Новый чат"}</span>{chat.status === "running" && <small aria-label="Ответ генерируется">●</small>}</button>)}{!loading && !chats.length && <p className={styles.muted}>Здесь появятся ваши диалоги.</p>}</nav>
      <div className={styles.sidebarFooter}><button onClick={() => { setSettingsOpen((open) => !open); setSidebarOpen(false); }} aria-expanded={settingsOpen}>Подключение ChatGPT</button><a href="/admin">Панель управления ↗</a></div>
    </aside>
    {mobileDrawerOpen && <button className={styles.scrim} tabIndex={-1} aria-hidden="true" onClick={() => setSidebarOpen(false)} />}
    <section className={styles.main} aria-label="Диалог с Codex" inert={mobileDrawerOpen || undefined} aria-hidden={mobileDrawerOpen || undefined}>
      <header className={styles.toolbar}><button ref={menuRef} className={styles.menuButton} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)} aria-label="Открыть список чатов">☰</button><div className={styles.heading}><h1>{detail?.chat.title || "Чат с Codex"}</h1><span className={styles.connection}>{connectionLabel}</span></div><label className={styles.modelLabel}><span className={styles.srOnly}>Модель</span><select aria-label="Модель" value={model} disabled={!models.length || running || busy} onChange={(event) => setModel(event.target.value)}>{!models.length && <option value="">Модель недоступна</option>}{models.map((entry) => <option key={entry.id} value={entry.id}>{entry.name || entry.id}</option>)}</select></label><button className={styles.settingsButton} aria-label="Настройки подключения" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>⚙</button></header>
      {(settingsOpen || (!loading && status && !status.ready)) && <section className={styles.settings} aria-label="Подключение ChatGPT"><div><h2>Аккаунт ChatGPT</h2><p>Войдите один раз. Сообщения используют лимиты Codex вашей подписки; ключ API не нужен.</p></div>{status?.error && <p role="alert" className={styles.warning}>{status.error}</p>}{!status?.configured && <p>Сервис ещё не настроен на сервере. Проверьте конфигурацию защищённого подключения.</p>}{status?.login && <div className={styles.deviceLogin}><p>Откройте страницу входа и введите код:</p><code>{status.login.userCode}</code>{loginUrl ? <a href={loginUrl} target="_blank" rel="noopener noreferrer">Войти в ChatGPT ↗</a> : <p role="alert">Сервер вернул неизвестный адрес входа. Подключение остановлено.</p>}<span>После подтверждения этот экран обновится автоматически.</span></div>}<div className={styles.settingActions}>{status?.ready ? <><span>Подключён аккаунт ChatGPT</span><button disabled={busy || running} onClick={() => void authenticate("logout")}>Отключить аккаунт</button></> : <button disabled={busy || !status?.configured || Boolean(status?.login)} onClick={() => void authenticate("login")}>{busy ? "Подключаю…" : "Подключить ChatGPT"}</button>}</div></section>}
      {(error || pollError) && <div className={styles.error} role="alert"><span>{error || pollError}</span><button disabled={busy} onClick={() => { setError(""); void Promise.all([refresh(), ...(activeId ? [refreshDetail(activeId)] : [])]).catch((cause) => setPollError(errorText(cause))); }}>Обновить соединение</button></div>}
      <div className={styles.messages} ref={scrollRef} onScroll={() => { const element = scrollRef.current; if (element) nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }}>
        <div className={styles.messageColumn}>{activeId && !detail ? <p role="status" className={styles.empty}>Открываю диалог…</p> : !detail?.messages.length ? <div className={styles.empty}><span className={styles.emptyKicker}>Личный чат · Codex</span><h2>С чего начнём?</h2><p>Задайте вопрос или опишите задачу.</p></div> : detail.messages.map((message) => <article key={message.id} className={`${styles.message} ${message.role === "user" ? styles.userMessage : styles.assistantMessage}`} aria-label={message.role === "user" ? "Ваше сообщение" : "Ответ Codex"}><span className={styles.role}>{message.role === "user" ? "Вы" : "Codex"}</span><div className={styles.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({ alt }) => <span>[Изображение: {alt || "внешний ресурс"}]</span> }}>{message.text}</ReactMarkdown></div></article>)}{running && <p className={styles.generating} role="status">Codex отвечает…</p>}{detail?.error && <p className={styles.warning} role="alert">{detail.error}</p>}</div>
      </div>
      <form className={styles.composerWrap} onSubmit={(event) => { event.preventDefault(); void send(); }}><div className={styles.composer}><label htmlFor="codex-message" className={styles.srOnly}>Сообщение для Codex</label><textarea id="codex-message" ref={inputRef} rows={3} maxLength={32_000} value={text} placeholder={status?.ready ? "Напишите сообщение…" : "Сначала подключите ChatGPT"} onChange={(event) => setDrafts((current) => ({ ...current, [activeId ?? "new"]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><div className={styles.composerActions}><span>Enter — отправить · Shift + Enter — новая строка</span>{running ? <button type="button" disabled={busy} onClick={() => void stop()}>Остановить</button> : <button type="submit" disabled={!canSendChat(status, model, text, Boolean(running), busy) || Boolean(activeId && !detail)}>{busy ? "Отправляю…" : "Отправить ↑"}</button>}</div></div><p className={styles.composerHint}>Ответы могут содержать ошибки. Проверяйте важную информацию.</p></form>
    </section>
  </main>;
}
