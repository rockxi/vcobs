"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Device = { id: string; name: string; online: boolean; controlled: boolean };
type ConnectionState = "idle" | "connecting" | "connected" | "password" | "error";
type AuthenticationMode = "vnc" | "mac";
type RfbClient = EventTarget & { scaleViewport: boolean; clipViewport: boolean; disconnect(): void; sendCredentials(credentials: { username?: string; password?: string }): void };

function relayUrl(deviceId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/remote/ws?id=${encodeURIComponent(deviceId)}`;
}

export function RemoteDesktop() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RfbClient | null>(null);
  const connectionAttemptRef = useRef(0);
  const authenticationErrorRef = useRef(false);
  const mountedRef = useRef(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [message, setMessage] = useState("Загружаем доступные Mac…");
  const [scale, setScale] = useState(true);
  const [authentication, setAuthentication] = useState<AuthenticationMode>("vnc");
  const [needsUsername, setNeedsUsername] = useState(false);

  const disconnect = useCallback((nextMessage = "Сеанс отключён.") => {
    connectionAttemptRef.current += 1;
    const rfb = rfbRef.current;
    rfbRef.current = null;
    if (rfb) rfb.disconnect();
    authenticationErrorRef.current = false;
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
  useEffect(() => () => { mountedRef.current = false; connectionAttemptRef.current += 1; rfbRef.current?.disconnect(); rfbRef.current = null; }, []);
  useEffect(() => { if (rfbRef.current) rfbRef.current.scaleViewport = scale; }, [scale]);

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
      const Client = authentication === "vnc" ? PasswordOnlyRFB : RFB;
      const rfb = new Client(canvasRef.current, relayUrl(device.id), { credentials: {} });
      rfb.scaleViewport = scale; rfb.clipViewport = false;
      rfb.addEventListener("connect", () => { if (rfbRef.current === rfb) { setConnection("connected"); setMessage(`Подключено к ${device.name}. Щёлкните по экрану для клавиатуры.`); } });
      rfb.addEventListener("credentialsrequired", (event: Event) => { if (rfbRef.current === rfb) { const usernameRequired = (event as CustomEvent<{ types?: string[] }>).detail?.types?.includes("username") ?? false; setNeedsUsername(usernameRequired); setConnection("password"); setMessage(usernameRequired ? "Введите имя пользователя Mac и пароль для удалённого управления." : "Введите пароль VNC."); } });
      rfb.addEventListener("disconnect", (event: Event) => { if (rfbRef.current === rfb) { rfbRef.current = null; if (authenticationErrorRef.current) { setConnection("error"); setMessage(authentication === "vnc" ? "Mac отклонил пароль VNC. Проверьте отдельный пароль в настройках удалённого управления." : "Mac отклонил вход по учётной записи. Проверьте имя пользователя, пароль и права удалённого управления."); } else { setConnection("idle"); setMessage((event as CustomEvent<{ clean?: boolean }>).detail?.clean ? "Сеанс завершён." : "Соединение с удалённым экраном прервано."); } } });
      rfb.addEventListener("securityfailure", () => { if (rfbRef.current === rfb) authenticationErrorRef.current = true; });
      rfbRef.current = rfb;
    } catch { if (connectionAttemptRef.current !== attempt || !mountedRef.current) return; setConnection("error"); setMessage("Не удалось открыть защищённый сеанс. Проверьте доступность Mac."); }
  };
  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const fields = new FormData(event.currentTarget); const password = fields.get("vnc-password"); const username = fields.get("vnc-username");
    if (typeof password !== "string" || !password || !rfbRef.current) return;
    if (needsUsername && (typeof username !== "string" || !username)) return;
    rfbRef.current.sendCredentials(needsUsername ? { username: username as string, password } : { password }); event.currentTarget.reset(); setConnection("connecting"); setMessage("Проверяем данные для входа…");
  };
  const selected = devices.find((device) => device.id === selectedId);
  const canConnect = !!selected && selected.online && !selected.controlled;
  return <div className="remote-desktop" aria-live="polite">
    <div className="remote-toolbar"><label htmlFor="remote-device">Mac <select id="remote-device" value={selectedId ?? ""} onChange={(event) => { disconnect("Выберите Mac для подключения."); setSelectedId(event.target.value || null); }}><option value="">Выберите устройство</option>{devices.map((device) => <option key={device.id} value={device.id} disabled={!device.online}>{device.name}{device.online ? device.controlled ? " · занят" : " · онлайн" : " · офлайн"}</option>)}</select></label><label htmlFor="remote-auth">Способ входа<select id="remote-auth" value={authentication} onChange={(event) => { disconnect("Способ входа изменён."); setAuthentication(event.target.value as AuthenticationMode); }}><option value="vnc">Отдельный пароль VNC</option><option value="mac">Учётная запись Mac</option></select></label><span className={`remote-status ${selected?.online ? "online" : ""}`}>{selected ? selected.online ? selected.controlled ? "занят" : "онлайн" : "офлайн" : `${devices.filter((device) => device.online).length} онлайн`}</span><button type="button" onClick={connection === "idle" || connection === "error" ? connect : () => disconnect()} disabled={(connection === "idle" || connection === "error") && !canConnect}>{connection === "idle" || connection === "error" ? "Подключиться" : "Отключиться"}</button><label className="remote-toggle"><input type="checkbox" checked={scale} onChange={(event) => setScale(event.target.checked)} /> Масштабировать</label><button type="button" className="remote-plain-button" onClick={() => canvasRef.current?.requestFullscreen?.()} disabled={!rfbRef.current}>Полный экран</button></div>
    <p className={connection === "error" ? "form-error" : "remote-message"} role="status">{message}</p>
    {connection === "password" && <form className="remote-password" onSubmit={submitPassword}>{needsUsername && <label htmlFor="vnc-username">Имя пользователя Mac<input id="vnc-username" name="vnc-username" type="text" autoComplete="username" autoFocus required /></label>}<label htmlFor="vnc-password">{needsUsername ? "Пароль учётной записи Mac" : "Пароль VNC"}<input id="vnc-password" name="vnc-password" type="password" autoComplete="off" autoFocus={!needsUsername} required /></label><button type="submit">Продолжить</button></form>}
    <div className="remote-screen"><div className="remote-canvas" ref={canvasRef} tabIndex={0} aria-label="Интерактивный удалённый экран Mac" />{connection === "idle" && <p className="remote-placeholder">Экран появится здесь после подключения.</p>}</div><p className="remote-help">Для клавиатуры сначала щёлкните или коснитесь экрана. На телефоне используйте поворот экрана; закрытие вкладки немедленно завершает VNC-сеанс.</p>
  </div>;
}
