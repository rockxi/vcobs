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
  private outgoing: Promise<void> = Promise.resolve();
  private readonly base: string;

  constructor(deviceId: string) {
    this.base = `/remote/http/?id=${encodeURIComponent(deviceId)}`;
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
      void this.poll();
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

  send(data: Uint8Array | ArrayBuffer) {
    if (this.readyState !== 1 || !this.session) return;
    const bytes = data instanceof ArrayBuffer ? data.slice(0) : Uint8Array.from(data).buffer;
    const session = this.session;
    this.outgoing = this.outgoing.then(async () => {
      if (this.readyState !== 1) return;
      const response = await fetch(this.url("send"), { method: "POST", credentials: "same-origin", cache: "no-store", headers: this.headers(session), body: bytes });
      if (!response.ok) throw new Error(`HTTPS tunnel send failed (${response.status})`);
    }).catch(() => { if (this.readyState === 1) this.fail(); });
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
    this.releaseSession();
    this.onclose?.({ code: clean ? 1000 : 1006, wasClean: clean });
  }
}
