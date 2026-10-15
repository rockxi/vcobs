import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const directory = await mkdtemp(path.join(tmpdir(), "vcobs-chat-scratchpad-"));
process.env.PASTE_DATA_DIR = directory;
process.env.VCOBS_ADMIN_SESSION_SECRET = "scratchpad-test-session-secret-at-least-32-characters";
process.env.VCOBS_TRUST_PROXY_HEADERS = "false";
// @ts-expect-error Native Node tests load TypeScript directly.
const store = await import("../lib/admin-chat-scratchpad.ts");
// @ts-expect-error Native Node tests load TypeScript directly.
const auth = await import("../lib/admin-auth.ts");
// @ts-expect-error Native Node tests load TypeScript directly.
const pastes = await import("../lib/pastes.ts");
test.after(async () => rm(directory, { recursive: true, force: true }));
type Handler = (request: Request) => Promise<Response>;
const compiled = ts.transpileModule(readFileSync(new URL("../app/api/admin/chat-scratchpad/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const route: Record<string, Handler> = {};
vm.runInNewContext(compiled, { exports: route, Response, Buffer, require: (name: string) => name === "@/lib/admin-auth" ? auth : name === "@/lib/admin-chat-scratchpad" ? store : (() => { throw new Error(`Unexpected import: ${name}`); })() });
function request(method = "GET", body?: unknown, session: string | undefined = auth.createAdminSession()!, origin: string | null = "https://vcobs.test", contentType = "application/json") {
  return new Request("https://vcobs.test/api/admin/chat-scratchpad", { method, headers: { ...(session ? { cookie: `${auth.ADMIN_SESSION_COOKIE}=${session}` } : {}), ...(origin ? { origin } : {}), "content-type": contentType }, ...(method === "PUT" ? { body: JSON.stringify(body) } : {}) });
}

test("scratchpad storage starts empty, retains exact Unicode and empty text with private atomic files", async () => {
  assert.equal(await store.getChatScratchpad(), "");
  const text = "  пароль не настоящий\nПривет 🧊\r\n\t ";
  await store.saveChatScratchpad(text);
  assert.equal(await store.getChatScratchpad(), text);
  assert.equal((await stat(path.join(directory, ".admin-chat-scratchpad.json"))).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(directory), [".admin-chat-scratchpad.json"]);
  assert.deepEqual(await pastes.listActivePastes(), []);
  await store.saveChatScratchpad("");
  assert.equal(await store.getChatScratchpad(), "");
});

test("scratchpad requires valid unexpired admin auth for reads and writes, plus same origin for writes", async () => {
  for (const session of ["", "forged", auth.createAdminSession(Date.now() - 9 * 60 * 60 * 1000)!]) {
    for (const method of ["GET", "PUT"]) assert.equal((await route[method](request(method, { text: "unauthorized" }, session))).status, 401);
  }
  for (const origin of [null, "https://evil.test", "http://vcobs.test"]) assert.equal((await route.PUT(request("PUT", { text: "csrf" }, auth.createAdminSession()!, origin))).status, 403);
  assert.equal(await store.getChatScratchpad(), "");
});

test("scratchpad GET and PUT persist separately from Codex and never cache content", async () => {
  const text = "private field\nп х 🧊";
  const saved = await route.PUT(request("PUT", { text }));
  assert.equal(saved.status, 200);
  const loaded = await route.GET(request());
  assert.equal(loaded.status, 200);
  assert.deepEqual(await loaded.json(), { text });
  assert.match(loaded.headers.get("cache-control")!, /private, no-store/);
  assert.equal(loaded.headers.get("vary"), "Cookie");
  assert.equal((await route.PUT(request("PUT", { text: "" }))).status, 200);
  assert.equal(await store.getChatScratchpad(), "");
});

test("scratchpad validates data and character/body limits without damaging saved content", async () => {
  for (const body of [null, [], {}, { text: null }, { text: 3 }]) assert.equal((await route.PUT(request("PUT", body))).status, 400);
  assert.equal((await route.PUT(request("PUT", { text: "x" }, undefined, "https://vcobs.test", "text/plain"))).status, 415);
  const maximum = "п".repeat(store.CHAT_SCRATCHPAD_LIMIT);
  assert.equal(store.CHAT_SCRATCHPAD_LIMIT, 1_000_000);
  assert.equal((await route.PUT(request("PUT", { text: maximum }))).status, 200);
  assert.deepEqual(await (await route.GET(request())).json(), { text: maximum });
  const overflow = await route.PUT(request("PUT", { text: maximum + "!" }));
  assert.equal(overflow.status, 413);
  assert.equal((await overflow.json()).error, "Максимум 1 000 000 символов.");
  assert.equal((await route.PUT(request("PUT", { text: "x", padding: "x".repeat(store.CHAT_SCRATCHPAD_LIMIT * 6 + 256) }))).status, 413);
  assert.equal(await store.getChatScratchpad(), maximum);
  await assert.rejects(store.saveChatScratchpad(maximum + "!"));
});

test("scratchpad accepts one million characters with maximum JSON escaping", async () => {
  const text = "\u0000".repeat(store.CHAT_SCRATCHPAD_LIMIT);
  assert.equal((await route.PUT(request("PUT", { text }))).status, 200);
  assert.equal(await store.getChatScratchpad(), text);
});

test("scratchpad keeps existing 32,000-character storage compatible", async () => {
  const text = "я".repeat(32_000);
  await writeFile(path.join(directory, ".admin-chat-scratchpad.json"), JSON.stringify({ text }));
  assert.deepEqual(await (await route.GET(request())).json(), { text });
});

test("corrupt scratchpad fails visibly rather than resetting saved content", async () => {
  await writeFile(path.join(directory, ".admin-chat-scratchpad.json"), "not JSON");
  const response = await route.GET(request());
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /загрузить/);
  assert.doesNotMatch(JSON.stringify(await (await route.GET(request())).json()), /admin-chat-scratchpad.json|SyntaxError/);
  await store.saveChatScratchpad("recovered");
  assert.equal(await store.getChatScratchpad(), "recovered");
});

test("scratchpad header stays separate from chat requests and exposes fixed scrollable input", () => {
  const component = readFileSync(new URL("../components/admin-chat-scratchpad.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../components/admin-chat-workspace.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/admin/chat/chat.module.css", import.meta.url), "utf8");
  assert.match(component, /const endpoint = "\/api\/admin\/chat-scratchpad"/);
  assert.match(component, /navigator\.clipboard\.writeText\(latest.current\)/);
  assert.match(component, /disabled=\{!loaded\}/);
  assert.match(component, /maxLength=\{1_000_000\}/);
  assert.match(component, /while \(latest.current !== saved.current\)/);
  assert.match(component, /attempt !== loadAttempt.current/);
  assert.match(workspace, /<AdminChatScratchpad \/><label className=\{styles.modelLabel\}/);
  assert.match(css, /\.scratchpad \{ flex:0 1 220px; min-width:180px; max-width:220px; \}/);
  assert.match(css, /width:110px; height:32px; min-height:32px; max-height:32px; resize:none; overflow:auto/);
  const tablet = css.split("@media(min-width:761px) and (max-width:1100px)")[1].split("@media(max-width:760px)")[0];
  assert.doesNotMatch(tablet, /\.scratchpad\s*\{/);
  const mobile = css.split("@media(max-width:760px)")[1];
  assert.match(mobile, /\.scratchpad \{ flex:0 1 190px; min-width:0; \}/);
  assert.match(mobile, /\.scratchpadControls textarea \{ width:80px; height:44px; min-height:44px; max-height:44px; font-size:16px; \}/);
  assert.match(mobile, /\.scratchpadControls button \{ height:44px;/);
});
