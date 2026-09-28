import assert from "node:assert/strict";
import test from "node:test";
import { RemoteHttpChannel } from "../lib/remote-http-channel.ts";

test("HTTPS channel batches ordered VNC writes instead of posting each key or frame separately", async () => {
  const originalFetch = globalThis.fetch;
  const writes: Uint8Array[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/connect")) return Response.json({ session: "test-session" });
    if (url.includes("/send")) { writes.push(new Uint8Array(init?.body as ArrayBuffer)); return new Response(null, { status: 204 }); }
    if (url.includes("/close")) return new Response(null, { status: 204 });
    return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  };
  try {
    const channel = new RemoteHttpChannel("mac");
    await new Promise<void>(resolve => { channel.onopen = resolve; void channel.start(); });
    channel.send(new Uint8Array([1, 2])); channel.send(new Uint8Array([3, 4]));
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(writes.length, 1);
    assert.deepEqual([...writes[0]], [1, 2, 3, 4]);
    channel.close();
  } finally { globalThis.fetch = originalFetch; }
});

test("HTTPS stream reconstructs split binary frames for noVNC", async () => {
  const originalFetch = globalThis.fetch;
  const frame = new Uint8Array([0, 0, 0, 3, 1, 2, 3]);
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/connect")) return Response.json({ session: "test-session" });
    if (url.includes("/stream")) return new Response(new ReadableStream({ start(controller) { controller.enqueue(frame.slice(0, 2)); controller.enqueue(frame.slice(2, 5)); controller.enqueue(frame.slice(5)); controller.close(); } }), { status: 200 });
    return new Response(null, { status: 204 });
  };
  try {
    const channel = new RemoteHttpChannel("mac", "stream");
    const received = new Promise<Uint8Array>(resolve => { channel.onmessage = event => resolve(new Uint8Array(event.data)); });
    await channel.start();
    assert.deepEqual([...(await received)], [1, 2, 3]);
    channel.close();
  } finally { globalThis.fetch = originalFetch; }
});
