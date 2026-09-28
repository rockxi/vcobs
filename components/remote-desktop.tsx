"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { RemoteHttpChannel } from "@/lib/remote-http-channel";

type Device = { id: string; name: string; online: boolean; controlled: boolean };
type ConnectionState = "idle" | "connecting" | "connected" | "password" | "error";
type AuthenticationMode = "vnc" | "mac";
type TransportMode = "auto" | "websocket" | "https" | "https-poll";
type RfbClient = EventTarget & { scaleViewport: boolean; clipViewport: boolean; showDotCursor: boolean; qualityLevel: number; compressionLevel: number; disconnect(): void; focus(options?: FocusOptions): void; sendKey(keysym: number, code?: string, down?: boolean): void; sendCredentials(credentials: { username?: string; password?: string }): void };

const DIRECT_KEYS: Record<string, number> = { Backspace: 0xff08, Enter: 0xff0d, Escape: 0xff1b, Delete: 0xffff, ArrowLeft: 0xff51, ArrowUp: 0xff52, ArrowRight: 0xff53, ArrowDown: 0xff54, Home: 0xff50, End: 0xff57, PageUp: 0xff55, PageDown: 0xff56 };

function relayUrl(deviceId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/remote/ws?id=${encodeURIComponent(deviceId)}`;
}

export function RemoteDesktop() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RfbClient | null>(null);
  const connectionAttemptRef = useRef(0);
  const authenticationErrorRef = useRef(false);
  const keyQueueRef = useRef<Array<{ keysym: number; code: string }>>([]);
  const keyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [message, setMessage] = useState("Загружаем доступные Mac…");
  const [scale, setScale] = useState(true);
  const [controlOnly, setControlOnly] = useState(false);
  const [authentication, setAuthentication] = useState<AuthenticationMode>("vnc");
  const [transport, setTransport] = useState<TransportMode>("auto");
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [needsUsername, setNeedsUsername] = useState(false);

  const disconnect = useCallback((nextMessage = "Сеанс отключён.") => {
    connectionAttemptRef.current += 1;
    const rfb = rfbRef.current;
    rfbRef.current = null;
    if (rfb) rfb.disconnect();
    authenticationErrorRef.current = false;
    keyQueueRef.current = [];
    if (keyTimerRef.current) clearTimeout(keyTimerRef.current);
    keyTimerRef.current = null;
    setKeyboardFocused(false);
    setNeedsUsername(false);
    setConnection("idle"); setMessage(nextMessage);
  }, []);
  const loadDevices = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/remote", { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401 || response.status === 403) { disconnect("Сеанс администратора завершён."); window.location.assign("/admin"); return; }
      if (!response.ok) throw new Error("Сервис удалённых экранов временно недоступен.");
      const payload = await response.json() as { devices?: Device[] };
      setDevices(Array.isArray(payload.devices) ? payload.devices : []);
      setMessage((current) => current === "Загружаем доступные Mac…" ? "Выберите Mac для подключения." : current);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось обновить список Mac."); }
  }, []);
  useEffect(() => { void loadDevices(); const timer = window.setInterval(() => void loadDevices(), 10_000); return () => window.clearInterval(timer); }, [loadDevices]);
  useEffect(() => () => { mountedRef.current = false; connectionAttemptRef.current += 1; if (keyTimerRef.current) clearTimeout(keyTimerRef.current); rfbRef.current?.disconnect(); rfbRef.current = null; }, []);
  useEffect(() => { if (rfbRef.current) rfbRef.current.scaleViewport = scale; }, [scale]);
  useEffect(() => { if (rfbRef.current) { rfbRef.current.qualityLevel = controlOnly ? 0 : 6; rfbRef.current.compressionLevel = controlOnly ? 9 : 2; } }, [controlOnly]);

  const connect = async () => {
    const device = devices.find((candidate) => candidate.id === selectedId);
    if (!device || !device.online || device.controlled || !canvasRef.current) return;
    disconnect("Подключаемся к Mac…"); const attempt = connectionAttemptRef.current; setConnection("connecting");
    try {
      const { default: RFB } = await import("@novnc/novnc");
      if (connectionAttemptRef.current !== attempt || !canvasRef.current) return;
      class PasswordOnlyRFB extends RFB {
        _isSupportedSecurityType(type: number) { return type === 2; }
      }
      class MacAccountRFB extends RFB {
        _isSupportedSecurityType(type: number) { return type === 30; }
      }
      const Client = authentication === "vnc" ? PasswordOnlyRFB : MacAccountRFB;
      const openClient = (channel: "websocket" | "https" | "https-poll") => {
        if (!canvasRef.current || connectionAttemptRef.current !== attempt) return;
        const httpChannel = channel === "websocket" ? null : new RemoteHttpChannel(device.id, channel === "https" ? "stream" : "poll");
        const rfb = new Client(canvasRef.current, httpChannel || relayUrl(device.id), { credentials: {} }) as unknown as RfbClient & { _enabledContinuousUpdates: boolean };
        let wasConnected = false;
        rfb.scaleViewport = scale; rfb.clipViewport = false; rfb.showDotCursor = true; rfb.qualityLevel = controlOnly ? 0 : 6; rfb.compressionLevel = controlOnly ? 9 : 2;
        rfb.addEventListener("connect", () => { if (rfbRef.current === rfb) { wasConnected = true; if (controlOnly) rfb._enabledContinuousUpdates = true; setConnection("connected"); setMessage(`Подключено к ${device.name} через ${channel === "websocket" ? "WebSocket" : channel === "https" ? "HTTPS-поток" : "HTTPS-опрос"}${controlOnly ? " в режиме только управления" : ""}. Клавиатура активируется при нажатии на экран.`); window.requestAnimationFrame(() => { if (rfbRef.current === rfb) rfb.focus({ preventScroll: true }); }); } });
        rfb.addEventListener("credentialsrequired", (event: Event) => { if (rfbRef.current === rfb) { const usernameRequired = (event as CustomEvent<{ types?: string[] }>).detail?.types?.includes("username") ?? false; setNeedsUsername(usernameRequired); setConnection("password"); setMessage(usernameRequired ? "Введите имя пользователя Mac и пароль для удалённого управления." : "Введите пароль VNC."); } });
        rfb.addEventListener("disconnect", (event: Event) => { if (rfbRef.current === rfb) { rfbRef.current = null; setKeyboardFocused(false); if (transport === "auto" && channel === "websocket" && !wasConnected && !authenticationErrorRef.current) { setConnection("connecting"); setMessage("WebSocket недоступен. Пробуем подключение через HTTPS-опрос…"); openClient("https-poll"); return; } if (authenticationErrorRef.current) { setConnection("error"); setMessage(authentication === "vnc" ? "Mac отклонил пароль VNC. Проверьте отдельный пароль в настройках удалённого управления." : "Mac отклонил вход по учётной записи. Проверьте имя пользователя, пароль и права удалённого управления."); } else { setConnection("idle"); const clean = (event as CustomEvent<{ clean?: boolean }>).detail?.clean; setMessage(clean ? "Сеанс завершён." : httpChannel?.lastError ? `Соединение прервано: ${httpChannel.lastError}` : "Соединение с удалённым экраном прервано."); } } });
        rfb.addEventListener("securityfailure", () => { if (rfbRef.current === rfb) authenticationErrorRef.current = true; });
        rfbRef.current = rfb;
        httpChannel?.start();
      };
      openClient(transport === "auto" ? "websocket" : transport);
    } catch { if (connectionAttemptRef.current !== attempt || !mountedRef.current) return; setConnection("error"); setMessage("Не удалось открыть защищённый сеанс. Проверьте доступность Mac."); }
  };
  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const fields = new FormData(event.currentTarget); const password = fields.get("vnc-password"); const username = fields.get("vnc-username");
    if (typeof password !== "string" || !password || !rfbRef.current) return;
    if (needsUsername && (typeof username !== "string" || !username)) return;
    rfbRef.current.sendCredentials(needsUsername ? { username: username as string, password } : { password }); event.currentTarget.reset(); setConnection("connecting"); setMessage("Проверяем данные для входа…");
  };
  const typeDirectly = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (connection !== "connected" || !rfbRef.current || event.key === "Tab" || event.nativeEvent.isComposing) return;
    const point = event.key.length === 1 ? event.key.codePointAt(0) : undefined;
    const keysym = point === undefined ? DIRECT_KEYS[event.key] : point > 0xff ? 0x01000000 | point : point;
    if (keysym === undefined) return;
    event.preventDefault();
    keyQueueRef.current.push({ keysym, code: event.code });
    const sendNext = () => {
      const key = keyQueueRef.current.shift();
      const rfb = rfbRef.current;
      if (!key || !rfb || connection !== "connected") { keyTimerRef.current = null; return; }
      rfb.sendKey(key.keysym, key.code, true);
      keyTimerRef.current = setTimeout(() => {
        rfb.sendKey(key.keysym, key.code, false);
        keyTimerRef.current = setTimeout(sendNext, 8);
      }, 12);
    };
    if (!keyTimerRef.current) sendNext();
  };
  const selected = devices.find((device) => device.id === selectedId);
  const canConnect = !!selected && selected.online && !selected.controlled;
  return <div className="remote-desktop" aria-live="polite">
    <div className="remote-toolbar"><label htmlFor="remote-device">Mac <select id="remote-device" value={selectedId ?? ""} onChange={(event) => { disconnect("Выберите Mac для подключения."); setSelectedId(event.target.value || null); }}><option value="">Выберите устройство</option>{devices.map((device) => <option key={device.id} value={device.id} disabled={!device.online}>{device.name}{device.online ? device.controlled ? " · занят" : " · онлайн" : " · офлайн"}</option>)}</select></label><label htmlFor="remote-auth">Способ входа<select id="remote-auth" value={authentication} onChange={(event) => { disconnect("Способ входа изменён."); setAuthentication(event.target.value as AuthenticationMode); }}><option value="vnc">Отдельный пароль VNC</option><option value="mac">Учётная запись Mac</option></select></label><label htmlFor="remote-transport">Канал<select id="remote-transport" value={transport} onChange={(event) => { disconnect("Канал изменён."); setTransport(event.target.value as TransportMode); }}><option value="auto">Авто</option><option value="websocket">WebSocket</option><option value="https">HTTPS-поток</option><option value="https-poll">HTTPS-опрос</option></select></label><span className={`remote-status ${selected?.online ? "online" : ""}`}>{selected ? selected.online ? selected.controlled ? "занят" : "онлайн" : "офлайн" : `${devices.filter((device) => device.online).length} онлайн`}</span><button type="button" onClick={connection === "idle" || connection === "error" ? connect : () => disconnect()} disabled={(connection === "idle" || connection === "error") && !canConnect}>{connection === "idle" || connection === "error" ? "Подключиться" : "Отключиться"}</button><button type="button" className="remote-plain-button" onClick={() => rfbRef.current?.focus({ preventScroll: true })} disabled={connection !== "connected"}>{keyboardFocused ? "Клавиатура активна" : "Захватить клавиатуру"}</button><label className="remote-toggle"><input type="checkbox" checked={controlOnly} onChange={(event) => { if (rfbRef.current) disconnect("Режим управления изменён. Подключитесь снова."); setControlOnly(event.target.checked); }} /> Только управление</label><label className="remote-toggle"><input type="checkbox" checked={scale} onChange={(event) => setScale(event.target.checked)} /> Масштабировать</label><button type="button" className="remote-plain-button" onClick={() => canvasRef.current?.requestFullscreen?.()} disabled={!rfbRef.current || controlOnly}>Полный экран</button></div>
    <p className={connection === "error" ? "form-error" : "remote-message"} role="status">{message}</p>
    {connection === "connected" && <label className="remote-direct-input">Прямой ввод с клавиатуры<input type="text" autoComplete="off" spellCheck={false} placeholder="Нажимайте клавиши здесь, если экран не принимает ввод" onKeyDown={typeDirectly} onChange={(event) => { event.currentTarget.value = ""; }} /></label>}
    {connection === "password" && <form className="remote-password" onSubmit={submitPassword}>{needsUsername && <label htmlFor="vnc-username">Имя пользователя Mac<input id="vnc-username" name="vnc-username" type="text" autoComplete="username" autoFocus required /></label>}<label htmlFor="vnc-password">{needsUsername ? "Пароль учётной записи Mac" : "Пароль VNC"}<input id="vnc-password" name="vnc-password" type="password" autoComplete="off" autoFocus={!needsUsername} required /></label><button type="submit">Продолжить</button></form>}
    <div className={`remote-screen ${controlOnly ? "control-only" : ""}`}><div className="remote-canvas" ref={canvasRef} onMouseDownCapture={() => { if (connection === "connected") rfbRef.current?.focus({ preventScroll: true }); }} onFocusCapture={() => setKeyboardFocused(true)} onBlurCapture={() => setKeyboardFocused(false)} aria-label={controlOnly ? "Панель управления мышью Mac без изображения" : "Интерактивный удалённый экран Mac"} />{connection === "idle" && <p className="remote-placeholder">Экран появится здесь после подключения.</p>}{controlOnly && connection === "connected" && <p className="remote-control-overlay">Изображение скрыто · двигайте мышью по этой области</p>}</div><p className="remote-help">{controlOnly ? "Режим передаёт управление мышью и клавиатурой, а изображение скрывает. Для входа всё равно потребуется выбранный выше пароль." : "Для клавиатуры нажмите на экран или кнопку «Захватить клавиатуру». В закрытой сети канал автоматически переключится на HTTPS-опрос, если WebSocket заблокирован."}</p>
  </div>;
}
