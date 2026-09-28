import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";

export const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const DEVICE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_CONFIG = path.join(os.homedir(), ".config", "vcobs", "remote-agent.json");

export function validateConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("config must be an object");
  const { remoteUrl, deviceId, token } = value;
  if (typeof remoteUrl !== "string") throw new Error("remoteUrl must be a string");
  let url;
  try { url = new URL(remoteUrl); } catch { throw new Error("remoteUrl must be a valid wss URL"); }
  if (url.protocol !== "wss:" || url.pathname !== "/remote/agent" || url.search || url.hash || url.username || url.password) throw new Error("remoteUrl must be a clean wss:// URL ending in /remote/agent");
  if (typeof deviceId !== "string" || !DEVICE_ID.test(deviceId)) throw new Error("deviceId must contain 1-64 letters, digits, _ or -");
  if (typeof token !== "string" || token.length < 16 || token.length > 4096) throw new Error("token must be 16-4096 characters");
  return { remoteUrl: url.toString(), deviceId, token, vncHost: "127.0.0.1", vncPort: 5900 };
}

export function loadConfig(configPath = process.env.VCOBS_REMOTE_AGENT_CONFIG || DEFAULT_CONFIG) {
  const stat = fs.statSync(configPath);
  if ((stat.mode & 0o077) !== 0) throw new Error("config permissions must be 0600 (or stricter)");
  return validateConfig(JSON.parse(fs.readFileSync(configPath, "utf8")));
}

export class RemoteAgent {
  constructor(config, options = {}) {
    this.config = validateConfig(config);
    this.WebSocket = options.WebSocket || WebSocket;
    this.connectVnc = options.connectVnc || ((port, host) => net.createConnection({ port, host }));
    this.setTimer = options.setTimer || setTimeout;
    this.clearTimer = options.clearTimer || clearTimeout;
    this.log = options.log || (() => {});
    this.backoff = options.backoff || [1_000, 2_000, 5_000, 10_000, 30_000];
    this.retry = 0; this.stopped = false; this.ws = null; this.vnc = null; this.vncOwner = null; this.timer = null;
  }
  start() { if (this.ws || this.timer) return; this.stopped = false; this.#connectRelay(); }
  stop() { this.stopped = true; if (this.timer) this.clearTimer(this.timer); this.timer = null; this.#detach(); if (this.ws) { const ws = this.ws; this.ws = null; ws.close(1000, "shutdown"); } }
  #connectRelay() {
    if (this.stopped) return;
    const ws = this.ws = new this.WebSocket(this.config.remoteUrl, { headers: { Authorization: `Bearer ${this.config.token}`, "X-Vcobs-Device-Id": this.config.deviceId }, perMessageDeflate: false, maxPayload: MAX_BUFFERED_BYTES });
    ws.on("open", () => { if (this.ws === ws) { this.retry = 0; this.#send(JSON.stringify({ type: "ready" }), false, ws); } });
    ws.on("message", (data, isBinary) => {
      if (this.ws !== ws) return;
      if (!isBinary) this.#control(data, ws);
      else if (this.vnc && this.vncOwner === ws) {
        if (this.vnc.writableLength > MAX_BUFFERED_BYTES) { this.#error("vnc_backpressure"); return; }
        this.vnc.write(data);
      }
    });
    ws.on("close", () => { if (this.ws === ws) { this.ws = null; this.#detach(); this.#schedule(); } });
    ws.on("error", () => {});
  }
  #control(data, ws) {
    let command; try { command = JSON.parse(data.toString()); } catch { return this.#error("invalid_control", ws); }
    if (command?.type === "attach") this.#attach(ws);
    else if (command?.type === "detach") this.#detach();
    else this.#error("unknown_control", ws);
  }
  #attach(ws) {
    if (this.vnc) return;
    const socket = this.vnc = this.connectVnc(this.config.vncPort, this.config.vncHost); this.vncOwner = ws;
    socket.on("data", data => { if (this.vnc === socket && this.vncOwner === ws && this.ws === ws) this.#send(data, true, ws); });
    socket.on("error", () => { if (this.vnc === socket && this.vncOwner === ws) this.#error("vnc_unavailable", ws); });
    socket.on("close", () => { if (this.vnc === socket && this.vncOwner === ws) { this.vnc = null; this.vncOwner = null; if (this.ws === ws) this.#error("vnc_disconnected", ws); } });
  }
  #detach() { if (this.vnc) { const socket = this.vnc; this.vnc = null; this.vncOwner = null; socket.destroy(); } }
  #send(data, binary = false, ws = this.ws) {
    if (!ws || this.ws !== ws || ws.readyState !== this.WebSocket.OPEN) return false;
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) { ws.close(1013, "backpressure"); return false; }
    ws.send(data, { binary }); return true;
  }
  #error(code, ws = this.ws) { this.#send(JSON.stringify({ type: "error", code }), false, ws); this.#detach(); }
  #schedule() { if (this.stopped || this.timer) return; const delay = this.backoff[Math.min(this.retry++, this.backoff.length - 1)]; this.timer = this.setTimer(() => { this.timer = null; this.#connectRelay(); }, delay); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let agent;
  try { agent = new RemoteAgent(loadConfig()); agent.start(); }
  catch (error) { console.error(`vcobs remote agent: ${error.message}`); process.exitCode = 1; }
  const stop = () => agent?.stop(); process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
