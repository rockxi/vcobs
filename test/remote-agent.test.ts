import assert from "node:assert/strict";
import test from "node:test";
import net from "node:net";
import { EventEmitter } from "node:events";
import { WebSocketServer } from "ws";
import { WebSocket } from "ws";
import { RemoteAgent, validateConfig } from "../remote-agent/agent.js";

const tick = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));
const config = (remoteUrl: string) => ({ remoteUrl, deviceId: "mac_1", token: "0123456789abcdef" });

test("rejects insecure relay URLs and invalid device configuration", () => {
  assert.throws(() => validateConfig(config("ws://example.test/remote/agent")), /wss/);
  assert.throws(() => validateConfig({ ...config("wss://example.test/remote/agent"), deviceId: "bad id" }), /deviceId/);
  assert.equal(validateConfig(config("wss://example.test/remote/agent")).vncHost, "127.0.0.1");
});

test("relays bytes to one local VNC socket and closes it on detach", async () => {
  const vnc = net.createServer(socket => socket.on("data", data => socket.write(Buffer.concat([Buffer.from("vnc:"), data]))));
  await new Promise<void>(resolve => vnc.listen(0, "127.0.0.1", resolve));
  const vncPort = (vnc.address() as net.AddressInfo).port;
  const relay = new WebSocketServer({ port: 0 }); await new Promise<void>(resolve => relay.once("listening", resolve));
  const port = (relay.address() as net.AddressInfo).port; let agentSocket: WebSocket | undefined; let connections = 0; const messages: Buffer[] = [];
  relay.on("connection", ws => { connections++; agentSocket = ws as unknown as WebSocket; ws.on("message", (data, binary) => { if (binary) messages.push(Buffer.from(data)); }); });
  class TestWebSocket extends WebSocket { constructor(url: string, options: any) { super(url.replace("wss://", "ws://"), options); } }
  let vncArgs: any[] | undefined;
  const agent = new RemoteAgent(config(`wss://127.0.0.1:${port}/remote/agent`), { WebSocket: TestWebSocket, connectVnc: (p: number, h: string) => { vncArgs = [p, h]; return net.createConnection(vncPort, "127.0.0.1"); } });
  agent.start(); agent.start(); await tick(); assert.ok(agentSocket); assert.equal(connections, 1); assert.deepEqual(vncArgs, undefined);
  agentSocket!.send(JSON.stringify({ type: "attach" })); await tick();
  assert.deepEqual(vncArgs, [5900, "127.0.0.1"]);
  agentSocket!.send(Buffer.from("hello")); await tick();
  assert.deepEqual(messages, [Buffer.from("vnc:hello")]);
  agentSocket!.send(JSON.stringify({ type: "detach" })); await tick();
  assert.equal((agent as any).vnc, null);
  agent.stop();
  await new Promise<void>(resolve => relay.close(() => resolve())); await new Promise<void>(resolve => vnc.close(() => resolve()));
});

test("clean VNC close reports an error so the relay can close its browser pairing", async () => {
  const relay = new WebSocketServer({ port: 0 }); await new Promise<void>(resolve => relay.once("listening", resolve));
  const port = (relay.address() as net.AddressInfo).port; const controls: string[] = [];
  relay.on("connection", ws => { ws.on("message", (data, binary) => { if (!binary) controls.push(String(data)); }); setTimeout(() => ws.send(JSON.stringify({ type: "attach" })), 5); });
  class TestWebSocket extends WebSocket { constructor(url: string, options: any) { super(url.replace("wss://", "ws://"), options); } }
  const cleanClose = () => { const socket = new EventEmitter() as any; socket.destroy = () => socket.emit("close"); queueMicrotask(() => socket.emit("close")); return socket; };
  const agent = new RemoteAgent(config(`wss://127.0.0.1:${port}/remote/agent`), { WebSocket: TestWebSocket, connectVnc: cleanClose });
  agent.start(); await tick(50);
  assert.ok(controls.some(value => value.includes("vnc_disconnected")));
  agent.stop(); await new Promise<void>(resolve => relay.close(() => resolve()));
});

test("reports unavailable local VNC and reconnects after relay loss", async () => {
  const relay = new WebSocketServer({ port: 0 }); await new Promise<void>(resolve => relay.once("listening", resolve));
  const port = (relay.address() as net.AddressInfo).port; let connections = 0; let unavailable = false;
  relay.on("connection", ws => {
    connections++;
    if (connections === 1) { ws.send(JSON.stringify({ type: "attach" })); ws.on("message", data => { if (String(data).includes("vnc_unavailable")) unavailable = true; }); setTimeout(() => ws.close(), 25); }
  });
  class TestWebSocket extends WebSocket { constructor(url: string, options: any) { super(url.replace("wss://", "ws://"), options); } }
  const unavailableVnc = () => { const socket = new EventEmitter() as any; socket.destroy = () => socket.emit("close"); queueMicrotask(() => socket.emit("error", new Error("refused"))); return socket; };
  const agent = new RemoteAgent(config(`wss://127.0.0.1:${port}/remote/agent`), { WebSocket: TestWebSocket, connectVnc: unavailableVnc, backoff: [5] });
  agent.start(); await tick(90);
  assert.equal(unavailable, true); assert.ok(connections >= 2);
  agent.stop(); await new Promise<void>(resolve => relay.close(() => resolve()));
});
