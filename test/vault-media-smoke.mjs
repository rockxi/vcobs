import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const imagePath = "Folder/Sub Folder/picture.png";
const image = Buffer.from("89504e470d0a1a0a00000000", "hex");
const docs = new Map([
  [imagePath.toLowerCase(), { _id: imagePath.toLowerCase(), path: imagePath, type: "newnote", size: image.length, children: ["h:picture"] }],
  ["Assets/diagram.png".toLowerCase(), { _id: "assets/diagram.png", path: "Assets/diagram.png", type: "newnote", size: image.length, children: ["h:picture"] }],
  ["Elsewhere/picture.png".toLowerCase(), { _id: "elsewhere/picture.png", path: "Elsewhere/picture.png", type: "newnote", size: image.length, children: ["h:picture"] }],
  ["A/duplicate.png".toLowerCase(), { _id: "a/duplicate.png", path: "A/duplicate.png", type: "newnote", size: image.length, children: ["h:picture"] }],
  ["B/duplicate.png".toLowerCase(), { _id: "b/duplicate.png", path: "B/duplicate.png", type: "newnote", size: image.length, children: ["h:picture"] }],
  ["folder/../secret.png", { _id: "folder/../secret.png", path: "folder/../secret.png", type: "newnote", size: image.length, children: ["h:picture"] }],
  ["h:picture", { _id: "h:picture", type: "leaf", data: image.toString("base64") }],
]);
const mock = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  response.writeHead(200, { "Content-Type": "application/json" });
  if (request.url.endsWith("/_find")) {
    const regex = new RegExp(body.selector._id.$regex);
    response.end(JSON.stringify({ docs: [...docs.values()].filter((doc) => doc.type === body.selector.type && regex.test(doc._id)).slice(0, body.limit) }));
  } else response.end(JSON.stringify({ rows: body.keys.map((key) => ({ id: key, doc: docs.get(key) })) }));
});
await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const sitePort = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const secret = "local-smoke-test-session-secret-1234567890";
const origin = `http://127.0.0.1:${sitePort}`;
const site = spawn("npm", ["run", "start", "--", "-p", String(sitePort)], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, COUCHDB_URL: `http://127.0.0.1:${mock.address().port}`, COUCHDB_DATABASE: "obsidian", COUCHDB_USERNAME: "test", COUCHDB_PASSWORD: "test", VCOBS_ADMIN_SESSION_SECRET: secret, VCOBS_PUBLIC_ORIGIN: origin },
  stdio: "ignore",
});
const payload = `v1.${Math.floor(Date.now() / 1000) + 600}.abcdefghijklmnopqrstuvwx`;
const token = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
const headers = { cookie: `vcobs_admin_session=${token}` };
const url = `${origin}/api/admin/vault/media/${imagePath.split("/").map(encodeURIComponent).join("/")}`;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await fetch(`${origin}/api/health`)).ok; if (ready) break; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Next.js did not start");
  assert.equal((await fetch(url)).status, 401);
  const result = await fetch(url, { headers });
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal(result.headers.get("content-type"), "image/png");
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  assert.match(result.headers.get("cache-control"), /no-store/);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), image);
  assert.equal((await fetch(`${url}?obsidian=1`, { headers })).status, 200, "exact path must win even when basename is duplicated");
  const basename = `${origin}/api/admin/vault/media/Notes/diagram.png?obsidian=1`;
  assert.equal((await fetch(basename, { headers })).status, 200);
  assert.equal((await fetch(basename.replace("?obsidian=1", ""), { headers })).status, 404);
  assert.equal((await fetch(`${origin}/api/admin/vault/media/Notes/duplicate.png?obsidian=1`, { headers })).status, 409);
  assert.equal((await fetch(url.replace("picture.png", "missing.png"), { headers })).status, 404);
  assert.equal((await fetch(url.replace("picture.png", "picture.svg"), { headers })).status, 415);
  assert.equal((await fetch(`${origin}/api/admin/vault/media/folder%2F..%2Fsecret.png`, { headers })).status, 400);
  console.log("Vault media smoke passed: routing, auth, nested path, image bytes, MIME, no-store, nosniff, missing and unsafe formats.");
} finally {
  site.kill("SIGTERM");
  await new Promise((resolve) => mock.close(resolve));
}
