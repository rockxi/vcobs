// Local-only integration smoke test. Uses an in-memory CouchDB stand-in; never touches a real vault.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const slug = "editor_test";
const documentId = "folder/example.md";
const initial = `---\nvcobs-link: ${slug}\nvcobs-topic: tests\n---\n# Проверка\nСтарый текст\n`;
const documents = new Map([
  [documentId, { _id: documentId, _rev: "1-start", path: "folder/Example.md", children: ["h:old"], type: "plain", ctime: 1, mtime: 1, size: Buffer.byteLength(initial), eden: {} }],
  ["h:old", { _id: "h:old", type: "leaf", data: initial }],
]);

const mock = createServer(async (request, response) => {
  const parts = [];
  for await (const part of request) parts.push(part);
  const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : null;
  const path = new URL(request.url, "http://localhost").pathname.replace(/^\/obsidian/, "");
  let status = 200, result;
  if (path === "/_find") result = { docs: body.bookmark === "done" ? [] : [documents.get(documentId)], bookmark: "done" };
  else if (path === "/_all_docs") result = { rows: body.keys.map((id) => ({ id, doc: documents.get(id) })) };
  else if (path === "/_bulk_docs") result = body.docs.map((doc) => {
    const existing = documents.get(doc._id);
    if (existing && (!doc._rev || doc._rev !== existing._rev)) return { id: doc._id, error: "conflict" };
    const rev = doc._id === documentId ? "2-saved" : "1-leaf";
    documents.set(doc._id, { ...doc, _rev: rev });
    return { id: doc._id, ok: true, rev };
  });
  else { status = 404; result = { error: "not_found" }; }
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(result));
});

await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
const couchPort = mock.address().port;
const sitePort = couchPort + 1;
const secret = "local-smoke-test-session-secret-1234567890";
const site = spawn("npm", ["run", "start", "--", "-p", String(sitePort)], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, COUCHDB_URL: `http://127.0.0.1:${couchPort}`, COUCHDB_DATABASE: "obsidian", COUCHDB_USERNAME: "test", COUCHDB_PASSWORD: "test", VCOBS_ADMIN_SESSION_SECRET: secret, VCOBS_TRUST_PROXY_HEADERS: "true", VCOBS_PUBLIC_ORIGIN: `http://127.0.0.1:${sitePort}` },
  stdio: "ignore",
});

const origin = `http://127.0.0.1:${sitePort}`;
const payload = `v1.${Math.floor(Date.now() / 1000) + 600}.abcdefghijklmnopqrstuvwx`;
const token = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
const headers = { cookie: `vcobs_admin_session=${token}`, "x-forwarded-host": `127.0.0.1:${sitePort}`, "x-forwarded-proto": "http" };
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await fetch(`${origin}/api/health`)).ok; if (ready) break; } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Next.js did not start");
  assert.equal((await fetch(`${origin}/api/admin/notes/${slug}`)).status, 401);
  assert.equal((await fetch(`${origin}/api/admin/notes/${slug}`, { method: "PUT", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ markdown: initial, revision: "1-start" }) })).status, 401);
  assert.equal((await fetch(`${origin}/api/admin/notes/${slug}`, { method: "PUT", headers: { ...headers, origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify({ markdown: initial, revision: "1-start" }) })).status, 403);
  const loaded = await fetch(`${origin}/api/admin/notes/${slug}`, { headers });
  assert.equal(loaded.status, 200);
  assert.equal((await loaded.json()).markdown, initial);
  const changed = initial.replace("Старый текст", "Новый текст 😀");
  const missingPublication = await fetch(`${origin}/api/admin/notes/${slug}`, { method: "PUT", headers: { ...headers, origin, "Content-Type": "application/json" }, body: JSON.stringify({ markdown: changed.replace(`vcobs-link: ${slug}`, "vcobs-link: other"), revision: "1-start" }) });
  assert.equal(missingPublication.status, 400);
  const save = await fetch(`${origin}/api/admin/notes/${slug}`, { method: "PUT", headers: { ...headers, origin, "Content-Type": "application/json" }, body: JSON.stringify({ markdown: changed, revision: "1-start" }) });
  assert.equal(save.status, 200, await save.text());
  const metadata = documents.get(documentId);
  assert.equal(metadata._rev, "2-saved");
  assert.equal(metadata.children.map((id) => documents.get(id).data).join(""), changed);
  assert.equal(metadata.size, Buffer.byteLength(changed));
  const stale = await fetch(`${origin}/api/admin/notes/${slug}`, { method: "PUT", headers: { ...headers, origin, "Content-Type": "application/json" }, body: JSON.stringify({ markdown: changed + "more", revision: "1-start" }) });
  assert.equal(stale.status, 409);
  console.log("Couch editor smoke test passed: auth, read, LiveSync chunks, save, stale revision.");
} finally {
  site.kill("SIGTERM");
  await new Promise((resolve) => mock.close(resolve));
}
