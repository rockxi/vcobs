// A WebSocket-shaped binary channel for networks that block WebSocket upgrades.
// noVNC accepts this through its raw-channel constructor.
export class RemoteHttpChannel {
  binaryType = "arraybuffer";
  protocol = "";
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; wasClean: boolean }) => void) | null = null;
  private session: string | null = null;
  private pollAbort: AbortController | null = null;
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private sending = false;
  private readonly base: string;
  private readonly mode: "stream" | "poll";

  constructor(deviceId: string, mode: "stream" | "poll" = "stream") {
    this.base = `/remote/http/?id=${encodeURIComponent(deviceId)}`;
    this.mode = mode;
  }

  private url(action: string) { return this.base.replace("/http/", `/http/${action}`); }
  private headers(session?: string) {
    return { "x-vcobs-remote": "1", ...(session ? { "x-vcobs-remote-session": session } : {}) };
  }

  async start() {
    try {
      const response = await fetch(this.url("connect"), { method: "POST", credentials: "same-origin", cache: "no-store", headers: this.headers() });
      if (!response.ok) throw new Error(`HTTPS tunnel refused (${response.status})`);
      const payload = await response.json() as { session?: string };
      if (typeof payload.session !== "string" || !payload.session) throw new Error("HTTPS tunnel did not return a session");
      this.session = payload.session;
      if (this.readyState !== 0) { this.releaseSession(); return; }
      this.readyState = 1;
      this.onopen?.();
      void (this.mode === "stream" ? this.stream() : this.poll());
    } catch { if (this.readyState === 0) this.fail(); }
  }

  private async poll() {
    while (this.readyState === 1 && this.session) {
      const controller = new AbortController(); this.pollAbort = controller;
      try {
        const response = await fetch(this.url("poll"), { credentials: "same-origin", cache: "no-store", headers: this.headers(this.session), signal: controller.signal });
        if (response.status === 204) continue;
        if (!response.ok) throw new Error(`HTTPS tunnel poll failed (${response.status})`);
        const data = await response.arrayBuffer();
        if (data.byteLength && this.readyState === 1) this.onmessage?.({ data });
      } catch { if (this.readyState === 1) this.fail(); }
    }
  }

  private async stream() {
    const controller = new AbortController(); this.pollAbort = controller;
    let firstFrame = false;
    const firstFrameTimeout = setTimeout(() => { if (!firstFrame) controller.abort(); }, 5_000);
    try {
      const response = await fetch(this.url("stream"), { credentials: "same-origin", cache: "no-store", headers: this.headers(this.session || undefined), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`HTTPS stream failed (${response.status})`);
      const reader = response.body.getReader();
      let pending = new Uint8Array(0);
      while (this.readyState === 1) {
        const { done, value } = await reader.read();
        if (done) throw new Error("HTTPS stream closed");
        const combined = new Uint8Array(pending.length + value.length);
        combined.set(pending); combined.set(value, pending.length);
        let offset = 0;
        while (offset + 4 <= combined.length) {
          const length = new DataView(combined.buffer).getUint32(offset);
          if (length > 4 * 1024 * 1024) throw new Error("HTTPS stream frame too large");
          if (offset + 4 + length > combined.length) break;
          if (length && this.readyState === 1) {
            firstFrame = true; clearTimeout(firstFrameTimeout);
            this.onmessage?.({ data: combined.slice(offset + 4, offset + 4 + length).buffer });
          }
          offset += 4 + length;
        }
        pending = combined.slice(offset);
      }
    } catch { if (this.readyState === 1) this.fail(); }
    finally { clearTimeout(firstFrameTimeout); }
  }

  send(data: Uint8Array | ArrayBuffer) {
    if (this.readyState !== 1 || !this.session) return;
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data.slice(0)) : Uint8Array.from(data);
    this.pending.push(bytes); this.pendingBytes += bytes.byteLength;
    if (this.pendingBytes > 4 * 1024 * 1024) { this.fail(); return; }
    this.scheduleSend();
  }

  private scheduleSend() {
    if (this.sendTimer || this.sending || !this.pendingBytes) return;
    this.sendTimer = setTimeout(() => { this.sendTimer = null; void this.flushSend(); }, 16);
  }

  private async flushSend() {
    if (this.sending || !this.pendingBytes || this.readyState !== 1 || !this.session) return;
    this.sending = true;
    const bytes = new Uint8Array(this.pendingBytes);
    let offset = 0;
    for (const chunk of this.pending) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    this.pending = []; this.pendingBytes = 0;
    const session = this.session;
    try {
      const response = await fetch(this.url("send"), { method: "POST", credentials: "same-origin", cache: "no-store", headers: this.headers(session), body: bytes });
      if (!response.ok) throw new Error(`HTTPS tunnel send failed (${response.status})`);
    } catch { if (this.readyState === 1) this.fail(); }
    finally { this.sending = false; this.scheduleSend(); }
  }

  private releaseSession() {
    if (!this.session) return;
    const session = this.session; this.session = null;
    void fetch(this.url("close"), { method: "POST", credentials: "same-origin", cache: "no-store", keepalive: true, headers: this.headers(session) }).catch(() => {});
  }

  private fail() { this.onerror?.(); this.close(false); }
  close(clean = true) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.pollAbort?.abort(); this.pollAbort = null;
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null; this.pending = []; this.pendingBytes = 0;
    this.releaseSession();
    this.onclose?.({ code: clean ? 1000 : 1006, wasClean: clean });
  }
}
