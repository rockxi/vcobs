import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = new URL("../app/admin/remote/page.tsx", import.meta.url);
const client = new URL("../components/remote-desktop.tsx", import.meta.url);
const hub = new URL("../app/admin/page.tsx", import.meta.url);

test("remote desktop page is server-side guarded before rendering the client", async () => {
  const source = await readFile(page, "utf8");
  assert.match(source, /validateAdminSession\(\(await cookies\(\)\)\.get\(ADMIN_SESSION_COOKIE\)\?\.value\)/);
  assert.match(source, /redirect\("\/admin"\)/);
  assert.match(source, /<RemoteDesktop \/>/);
});

test("remote client uses noVNC over the same host and keeps VNC credentials out of server APIs", async () => {
  const source = await readFile(client, "utf8");
  assert.doesNotMatch(source, /import RFB from "@novnc\/novnc"/);
  assert.match(source, /await import\("@novnc\/novnc"\)/);
  assert.match(source, /\/remote\/ws\?id=\$\{encodeURIComponent\(deviceId\)\}/);
  assert.match(source, /window\.location\.protocol === "https:" \? "wss:" : "ws:"/);
  assert.match(source, /credentialsrequired/);
  assert.match(source, /detail\?\.types\?\.includes\("username"\)/);
  assert.match(source, /sendCredentials\(needsUsername \? \{ username: username as string, password \} : \{ password \}\)/);
  assert.match(source, /name="vnc-username"/);
  assert.match(source, /class PasswordOnlyRFB extends RFB/);
  assert.match(source, /_isSupportedSecurityType\(type: number\) \{ return type === 2; \}/);
  assert.match(source, /class MacAccountRFB extends RFB/);
  assert.match(source, /_isSupportedSecurityType\(type: number\) \{ return type === 30; \}/);
  assert.match(source, /<option value="vnc">Отдельный пароль VNC<\/option>/);
  assert.match(source, /<option value="mac">Учётная запись Mac<\/option>/);
  assert.match(source, /authenticationErrorRef\.current = true/);
  assert.match(source, /new RemoteHttpChannel\(device\.id, channel === "https" \? "stream" : "poll"\)/);
  assert.match(source, /WebSocket недоступен\. Пробуем подключение через HTTPS/);
  assert.match(source, /rfbRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /Захватить клавиатуру/);
  assert.match(source, /Прямой ввод с клавиатуры/);
  assert.match(source, /keyQueueRef\.current\.push/);
  assert.match(source, /rfb\.sendKey\(key\.keysym, key\.code, true\)/);
  assert.match(source, /rfb\.sendKey\(key\.keysym, key\.code, false\)/);
  assert.match(source, /Только управление/);
  assert.match(source, /_enabledContinuousUpdates = true/);
  assert.doesNotMatch(source, /className="remote-canvas"[^>]*tabIndex=/);
  assert.match(source, /event\.currentTarget\.reset\(\)/);
  assert.match(source, /autoComplete="off"/);
  assert.match(source, /disconnect\("Сеанс администратора завершён\."\)/);
  assert.doesNotMatch(source, /replaceChildren/);
  assert.match(source, /connection === "idle" && <p className="remote-placeholder">/);
  assert.match(source, /connectionAttemptRef\.current !== attempt \|\| !mountedRef\.current\) return; setConnection\("error"\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|\/api\/admin\/remote.*password/);
});

test("remote client polls state and disconnects noVNC on navigation or explicit disconnect", async () => {
  const source = await readFile(client, "utf8");
  assert.match(source, /setInterval\(\(\) => void loadDevices\(\), 10_000\)/);
  assert.match(source, /rfbRef\.current\?\.disconnect\(\)/);
  assert.match(source, /if \(rfb\) rfb\.disconnect\(\)/);
  assert.match(source, /device\.controlled/);
  assert.match(source, /requestFullscreen/);
  assert.match(source, /scaleViewport/);
});

test("admin hub exposes the protected remote desktop section", async () => {
  const source = await readFile(hub, "utf8");
  assert.match(source, /href: "\/admin\/remote"/);
  assert.match(source, /Удалённые экраны/);
});
