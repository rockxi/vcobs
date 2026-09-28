import http from "node:http";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const MAX_PAYLOAD = Number(process.env.VCOBS_REMOTE_MAX_PAYLOAD || 32 * 1024 * 1024);
const MAX_CONNECTIONS = Number(process.env.VCOBS_REMOTE_MAX_CONNECTIONS || 32);
const HEARTBEAT_MS = Number(process.env.VCOBS_REMOTE_HEARTBEAT_MS || 30_000);
const MAX_BUFFERED = Number(process.env.VCOBS_REMOTE_MAX_BUFFERED || 4 * 1024 * 1024);
const BROWSER_SESSION_MS = Number(process.env.VCOBS_REMOTE_BROWSER_SESSION_MS || 8 * 60 * 60 * 1000);

function parseDevices(value = process.env.VCOBS_REMOTE_DEVICES_JSON) {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    const devices = new Map();
    for (const [id, device] of Object.entries(parsed)) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !device || typeof device !== "object" || typeof device.name !== "string" || device.name.length > 128 || typeof device.token !== "string" || device.token.length < 16) continue;
      devices.set(id, { name: device.name, token: device.token });
    }
    return devices;
  } catch { return new Map(); }
}

function equalToken(actual, expected) {
  if (typeof actual !== "string") return false;
  const received = Buffer.from(actual), configured = Buffer.from(expected);
  return received.length === configured.length && timingSafeEqual(received, configured);
}
function cookieValue(header, name) {
  if (typeof header !== "string") return undefined;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || undefined;
  }
}
function bearerToken(header) { return typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : undefined; }
function validateAdminSession(token, secret, now = Date.now()) {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^\d+$/.test(parts[1]) || !/^[A-Za-z0-9_-]{20,}$/.test(parts[2]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[3])) return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(parts.slice(0, 3).join(".")).digest("base64url"));
  const received = Buffer.from(parts[3]);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
function writeUpgradeError(socket, status) { socket.write(`HTTP/1.1 ${status} \r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); socket.destroy(); }
function safeSend(socket, payload, binary = false, maxBuffered = MAX_BUFFERED) {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  if (socket.bufferedAmount > maxBuffered) { socket.close(1013, "backpressure"); return false; }
  socket.send(payload, { binary }); return true;
}

export function createRelayServer(options = {}) {
  const devices = options.devices || parseDevices(options.devicesJson);
  const origin = options.publicOrigin || process.env.VCOBS_PUBLIC_ORIGIN;
  const sessionSecret = options.sessionSecret || process.env.VCOBS_ADMIN_SESSION_SECRET;
  const internalSecret = options.internalSecret || sessionSecret;
  const maxPayload = options.maxPayload || MAX_PAYLOAD;
  const maxConnections = options.maxConnections || MAX_CONNECTIONS;
  const maxBuffered = options.maxBuffered || MAX_BUFFERED;
  const browserSessionMs = options.browserSessionMs || BROWSER_SESSION_MS;
  const agents = new Map(), browsers = new Map(), httpSessions = new Map();
  function finishHttp(id, notify = true) {
    const session = httpSessions.get(id); if (!session) return;
    httpSessions.delete(id); clearTimeout(session.expiration); clearTimeout(session.idle); clearTimeout(session.pendingTimer); clearTimeout(session.flushTimer); clearInterval(session.keepalive);
    if (session.pending && !session.pending.writableEnded) session.pending.writeHead(410).end();
    if (session.stream && !session.stream.writableEnded) session.stream.end();
    if (notify) safeSend(agents.get(id), JSON.stringify({ type: "detach" }));
  }
  function touchHttp(id, session) {
    clearTimeout(session.idle);
    session.idle = setTimeout(() => finishHttp(id), 60_000); session.idle.unref();
  }
  function flushHttp(session) {
    if (!session.pending || !session.queue.length) return;
    clearTimeout(session.pendingTimer); clearTimeout(session.flushTimer); session.flushTimer = null;
    const data = Buffer.concat(session.queue, session.queuedBytes);
    session.queue = []; session.queuedBytes = 0;
    session.pending.writeHead(200, { "content-type": "application/octet-stream", "content-length": data.length, "cache-control": "no-store" }).end(data);
    session.pending = null;
  }
  function flushStream(session) {
    if (!session.stream || !session.queue.length || session.streamBackpressured) return;
    clearTimeout(session.flushTimer); session.flushTimer = null;
    const data = Buffer.concat(session.queue, session.queuedBytes);
    session.queue = []; session.queuedBytes = 0;
    const frame = Buffer.allocUnsafe(data.length + 4);
    frame.writeUInt32BE(data.length, 0); data.copy(frame, 4);
    session.streamBackpressured = !session.stream.write(frame);
  }
  function deliverHttp(id, data) {
    const session = httpSessions.get(id); if (!session) return;
    touchHttp(id, session);
    session.queue.push(Buffer.from(data)); session.queuedBytes += data.length;
    if (session.queuedBytes > maxBuffered) { finishHttp(id); return; }
    if ((session.pending || session.stream) && !session.flushTimer) { session.flushTimer = setTimeout(() => { session.flushTimer = null; session.stream ? flushStream(session) : flushHttp(session); }, 16); session.flushTimer.unref(); }
  }
  const httpServer = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/internal/devices") {
      if (!equalToken(request.headers.authorization?.replace(/^Bearer /, ""), internalSecret || "")) { response.writeHead(404).end(); return; }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ devices: [...devices].map(([id, device]) => ({ id, name: device.name, online: agents.has(id), controlled: browsers.has(id) || httpSessions.has(id) })) }));
      return;
    }
    let url; try { url = new URL(request.url || "/", "http://relay"); } catch { response.writeHead(404).end(); return; }
    if (!url.pathname.startsWith("/remote/http/")) { response.writeHead(404).end(); return; }
    const id = url.searchParams.get("id");
    if (!id || !devices.has(id) || url.searchParams.size !== 1 || request.headers["x-vcobs-remote"] !== "1" || !validateAdminSession(cookieValue(request.headers.cookie, "vcobs_admin_session"), sessionSecret) || (request.method === "POST" && request.headers.origin !== origin)) { response.writeHead(403).end(); return; }
    response.setHeader("cache-control", "no-store");
    if (url.pathname === "/remote/http/connect" && request.method === "POST") {
      if (!agents.has(id) || browsers.has(id) || httpSessions.has(id) || connectionCount() >= maxConnections) { response.writeHead(409).end(); return; }
      const session = { token: randomBytes(24).toString("base64url"), queue: [], queuedBytes: 0, pending: null, pendingTimer: null, flushTimer: null, stream: null, streamBackpressured: false, keepalive: null, expiration: null, idle: null };
      httpSessions.set(id, session);
      const expiresAt = Number(cookieValue(request.headers.cookie, "vcobs_admin_session").split(".")[1]) * 1000;
      session.expiration = setTimeout(() => finishHttp(id), Math.max(1, Math.min(browserSessionMs, expiresAt - Date.now()))); session.expiration.unref();
      touchHttp(id, session);
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ session: session.token }));
      safeSend(agents.get(id), JSON.stringify({ type: "attach" }));
      return;
    }
    const session = httpSessions.get(id);
    if (!session || !equalToken(request.headers["x-vcobs-remote-session"], session.token)) { response.writeHead(403).end(); return; }
    touchHttp(id, session);
    if (url.pathname === "/remote/http/stream" && request.method === "GET") {
      if (session.stream || session.pending) { response.writeHead(409).end(); return; }
      session.stream = response;
      response.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" });
      response.flushHeaders();
      response.socket?.setNoDelay(true);
      response.on("drain", () => { session.streamBackpressured = false; flushStream(session); });
      response.on("close", () => { if (session.stream === response) { clearInterval(session.keepalive); session.stream = null; session.streamBackpressured = false; } });
      session.keepalive = setInterval(() => { if (session.stream === response && !session.streamBackpressured) { touchHttp(id, session); session.streamBackpressured = !response.write(Buffer.alloc(4)); } }, 15_000); session.keepalive.unref();
      flushStream(session);
      return;
    }
    if (url.pathname === "/remote/http/poll" && request.method === "GET") {
      if (session.pending || session.stream) { response.writeHead(409).end(); return; }
      session.pending = response;
      if (session.queue.length) { flushHttp(session); return; }
      session.pendingTimer = setTimeout(() => { if (session.pending === response) { session.pending = null; response.writeHead(204).end(); } }, 15_000); session.pendingTimer.unref();
      response.on("close", () => { if (session.pending === response) { clearTimeout(session.pendingTimer); session.pending = null; } });
      return;
    }
    if (url.pathname === "/remote/http/send" && request.method === "POST") {
      void (async () => {
        const chunks = []; let size = 0;
        for await (const chunk of request) { size += chunk.length; if (size > maxBuffered) { response.writeHead(413).end(); return; } chunks.push(chunk); }
        if (httpSessions.get(id) !== session || !safeSend(agents.get(id), Buffer.concat(chunks), true, maxBuffered)) { response.writeHead(410).end(); return; }
        response.writeHead(204).end();
      })().catch(() => { if (!response.headersSent) response.writeHead(400).end(); });
      return;
    }
    if (url.pathname === "/remote/http/close" && request.method === "POST") { finishHttp(id); response.writeHead(204).end(); return; }
    response.writeHead(404).end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload, perMessageDeflate: false, clientTracking: false });
  function detach(id, notify = true, closeBrowser = false) {
    const browser = browsers.get(id); if (!browser) return;
    browsers.delete(id);
    if (notify) safeSend(agents.get(id), JSON.stringify({ type: "detach" }));
    if (closeBrowser && browser.readyState < WebSocket.CLOSING) { browser.relayClosing = true; browser.close(1012, "agent unavailable"); }
  }
  function connectionCount() { return agents.size + browsers.size + httpSessions.size; }
  wss.on("connection", (socket, request, info) => {
    socket.isAlive = true;
    socket.on("pong", () => { socket.isAlive = true; });
    if (info.kind === "agent") {
      const previous = agents.get(info.id);
      if (previous) { detach(info.id, false, true); finishHttp(info.id, false); previous.close(1012, "replaced"); }
      agents.set(info.id, socket);
      socket.on("message", (data, isBinary) => {
        if (!isBinary) {
          try {
            const control = JSON.parse(data.toString());
            if (control?.type === "error") { detach(info.id, false, true); finishHttp(info.id, false); }
            else if (control?.type !== "ready") socket.close(1003, "unknown control");
            // `ready` is intentionally consumed locally: browsers never receive control JSON.
          } catch { socket.close(1003, "invalid control"); }
          return;
        }
        const browser = browsers.get(info.id);
        if (browser) safeSend(browser, data, true, maxBuffered);
        else deliverHttp(info.id, data);
      });
      socket.on("close", () => { if (agents.get(info.id) === socket) { agents.delete(info.id); detach(info.id, false, true); finishHttp(info.id, false); } });
      socket.on("error", () => {});
      return;
    }
    browsers.set(info.id, socket);
    const expiresAt = Number(info.session.split(".")[1]) * 1000;
    const lifetime = Math.max(1, Math.min(browserSessionMs, expiresAt - Date.now()));
    const expiration = setTimeout(() => socket.close(1008, "session expired"), lifetime); expiration.unref();
    safeSend(agents.get(info.id), JSON.stringify({ type: "attach" }), false, maxBuffered);
    socket.on("message", (data, isBinary) => { if (isBinary) safeSend(agents.get(info.id), data, true, maxBuffered); else { safeSend(agents.get(info.id), JSON.stringify({ type: "error", code: "browser_nonbinary" }), false, maxBuffered); socket.close(1003, "binary required"); } });
    socket.on("close", () => { clearTimeout(expiration); if (!socket.relayClosing) detach(info.id); });
    socket.on("error", () => {});
  });
  httpServer.on("upgrade", (request, socket, head) => {
    let url;
    try { url = new URL(request.url || "/", "http://relay"); }
    catch { return writeUpgradeError(socket, "400 Bad Request"); }
    const id = url.pathname === "/remote/agent" ? String(request.headers["x-vcobs-device-id"] || "") : (url.searchParams.get("id") || "");
    if (connectionCount() >= maxConnections || !devices.has(id)) return writeUpgradeError(socket, "403 Forbidden");
    if (url.pathname === "/remote/agent") {
      if (url.search || !equalToken(bearerToken(request.headers.authorization), devices.get(id).token)) return writeUpgradeError(socket, "401 Unauthorized");
      return wss.handleUpgrade(request, socket, head, ws => wss.emit("connection", ws, request, { kind: "agent", id }));
    }
    if (url.pathname === "/remote/ws") {
      if (!origin || request.headers.origin !== origin || !validateAdminSession(cookieValue(request.headers.cookie, "vcobs_admin_session"), sessionSecret) || !agents.has(id) || browsers.has(id) || httpSessions.has(id)) return writeUpgradeError(socket, "403 Forbidden");
      return wss.handleUpgrade(request, socket, head, ws => wss.emit("connection", ws, request, { kind: "browser", id, session: cookieValue(request.headers.cookie, "vcobs_admin_session") }));
    }
    writeUpgradeError(socket, "404 Not Found");
  });
  const heartbeat = setInterval(() => { for (const socket of [...agents.values(), ...browsers.values()]) { if (!socket.isAlive) socket.terminate(); else { socket.isAlive = false; socket.ping(); } } }, options.heartbeatMs || HEARTBEAT_MS);
  heartbeat.unref();
  return { server: httpServer, listen: (port = Number(process.env.PORT || 3081), host = "0.0.0.0") => new Promise(resolve => httpServer.listen(port, host, resolve)), close: () => new Promise(resolve => { clearInterval(heartbeat); for (const id of httpSessions.keys()) finishHttp(id, false); for (const socket of [...agents.values(), ...browsers.values()]) socket.terminate(); httpServer.close(() => resolve()); }), devices: () => [...devices].map(([id, device]) => ({ id, name: device.name, online: agents.has(id), controlled: browsers.has(id) || httpSessions.has(id) })) };
}
if (import.meta.url === `file://${process.argv[1]}`) createRelayServer().listen();
