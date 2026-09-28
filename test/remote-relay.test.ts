import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import net from "node:net";
import test from "node:test";
import { WebSocket } from "ws";
import { createRelayServer } from "../remote-relay/server.js";

const secret = "x".repeat(48), origin = "https://vcobs.example", token = "device-token-with-at-least-16-chars";
function session() { const payload = `v1.${Math.floor(Date.now() / 1000) + 60}.abcdefghijklmnopqrstuvwx`; return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`; }
function connect(url: string, headers: Record<string, string>) { return new Promise<WebSocket>((resolve, reject) => { const socket = new WebSocket(url, { headers }); socket.once("open", () => resolve(socket)); socket.once("unexpected-response", (_, response) => reject(new Error(String(response.statusCode)))); socket.once("error", reject); }); }
function nextMessage(socket: WebSocket) { return new Promise<{ data: Buffer; binary: boolean }>(resolve => socket.once("message", (data, binary) => resolve({ data: Buffer.from(data), binary }))); }
function closed(socket: WebSocket) { return new Promise<void>(resolve => socket.once("close", () => resolve())); }
function rawUpgrade(port: number, target: string) { return new Promise<string>((resolve, reject) => { const socket = net.connect(port, "127.0.0.1"); let response = ""; socket.setEncoding("utf8"); socket.once("connect", () => socket.write(`GET ${target} HTTP/1.1\r\nHost: relay\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`)); socket.on("data", data => response += data); socket.once("end", () => resolve(response)); socket.once("error", reject); }); }

test("relay authenticates endpoints, relays only binary RFB data, and frees a browser session", async () => {
  const relay = createRelayServer({ devicesJson: JSON.stringify({ mac: { name: "Office Mac", token } }), publicOrigin: origin, sessionSecret: secret, internalSecret: secret, heartbeatMs: 60_000 });
  await relay.listen(0, "127.0.0.1");
  const address = relay.server.address() as { port: number }, base = `ws://127.0.0.1:${address.port}`;
  await assert.rejects(connect(`${base}/remote/agent`, { "x-vcobs-device-id": "mac", authorization: "Bearer wrong" }));
  const agent = await connect(`${base}/remote/agent`, { "x-vcobs-device-id": "mac", authorization: `Bearer ${token}` });
  await assert.rejects(connect(`${base}/remote/ws?id=mac`, { origin: "https://evil.example", cookie: `vcobs_admin_session=${session()}` }));
  const attach = nextMessage(agent);
  const browser = await connect(`${base}/remote/ws?id=mac`, { origin, cookie: `vcobs_admin_session=${session()}` });
  assert.deepEqual(JSON.parse((await attach).data.toString()), { type: "attach" });
  await assert.rejects(connect(`${base}/remote/ws?id=mac`, { origin, cookie: `vcobs_admin_session=${session()}` }));
  const toBrowser = nextMessage(browser); agent.send(Buffer.from([1, 2, 3])); assert.deepEqual((await toBrowser).data, Buffer.from([1, 2, 3]));
  const toAgent = nextMessage(agent); browser.send(Buffer.from([4, 5])); assert.deepEqual((await toAgent).data, Buffer.from([4, 5]));
  const detach = nextMessage(agent); browser.close(); await closed(browser); assert.deepEqual(JSON.parse((await detach).data.toString()), { type: "detach" });
  assert.equal(relay.devices()[0].controlled, false);
  const attachAgain = nextMessage(agent);
  const browserAgain = await connect(`${base}/remote/ws?id=mac`, { origin, cookie: `vcobs_admin_session=${session()}` }); await attachAgain;
  const browserClosed = closed(browserAgain); agent.send(JSON.stringify({ type: "error", code: "vnc_unavailable" })); await browserClosed;
  const attachLast = nextMessage(agent);
  const browserLast = await connect(`${base}/remote/ws?id=mac`, { origin, cookie: `vcobs_admin_session=${session()}` }); await attachLast;
  const closedOnAgentLoss = closed(browserLast); agent.close(); await closed(agent); await closedOnAgentLoss;
  await relay.close();
});

test("relay exposes device status only to the internal shared secret", async () => {
  const relay = createRelayServer({ devicesJson: JSON.stringify({ mac: { name: "Office Mac", token } }), publicOrigin: origin, sessionSecret: secret, internalSecret: secret });
  await relay.listen(0, "127.0.0.1"); const address = relay.server.address() as { port: number };
  const denied = await fetch(`http://127.0.0.1:${address.port}/internal/devices`); assert.equal(denied.status, 404);
  const allowed = await fetch(`http://127.0.0.1:${address.port}/internal/devices`, { headers: { authorization: `Bearer ${secret}` } }); assert.deepEqual(await allowed.json(), { devices: [{ id: "mac", name: "Office Mac", online: false, controlled: false }] });
  await relay.close();
});

test("malformed upgrade targets are rejected without taking down the relay", async () => {
  const relay = createRelayServer({ devicesJson: JSON.stringify({ mac: { name: "Office Mac", token } }), publicOrigin: origin, sessionSecret: secret });
  await relay.listen(0, "127.0.0.1"); const address = relay.server.address() as { port: number };
  assert.match(await rawUpgrade(address.port, "http://[::1"), /^HTTP\/1\.1 400 Bad Request/m);
  const agent = await connect(`ws://127.0.0.1:${address.port}/remote/agent`, { "x-vcobs-device-id": "mac", authorization: `Bearer ${token}` });
  agent.close(); await closed(agent); await relay.close();
});
