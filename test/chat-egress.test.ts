import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("chat egress forwards bidirectional bytes exclusively to its configured Xray listener", async () => {
  const upstream = net.createServer(socket => socket.on("data", bytes => socket.write(Buffer.concat([Buffer.from("proxy:"), bytes]))));
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address() as net.AddressInfo;
  const child = spawn(process.execPath, ["ops/chat-egress.mjs"], {
    env: { ...process.env, VCOBS_XRAY_HOST: "127.0.0.1", VCOBS_XRAY_PORT: String(address.port) }, stdio: "ignore",
  });
  let socket: net.Socket | undefined;
  try {
    for (let i = 0; i < 40; i++) {
      const attempt = net.connect(3091, "127.0.0.1");
      try { await once(attempt, "connect"); socket = attempt; break; }
      catch { attempt.destroy(); await new Promise(resolve => setTimeout(resolve, 25)); }
    }
    assert.ok(socket, "proxy bridge becomes reachable");
    const response = once(socket, "data");
    socket.write("CONNECT auth.openai.com:443 HTTP/1.1\r\n\r\n");
    assert.equal(String((await response)[0]), "proxy:CONNECT auth.openai.com:443 HTTP/1.1\r\n\r\n");
  } finally {
    socket?.destroy();
    child.kill("SIGKILL");
    await once(child, "exit");
    upstream.close();
  }
});
