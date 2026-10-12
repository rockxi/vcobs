import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
// @ts-ignore Node test runner supports local TypeScript imports.
import * as proxy from "../lib/admin-chat-proxy.ts";
// @ts-ignore Node test runner supports local TypeScript imports.
import { canSendChat, chatDrawerTabTarget, chooseChatModel, recoverFailedChatLogin, safeDeviceLoginUrl } from "../lib/admin-chat-state.ts";

test("failed device login clears stale code and allows a fresh sign-in attempt", () => {
  const status = { configured: true, ready: false, account: null, login: { verificationUrl: "https://auth.openai.com/codex/device", userCode: "EXPIRED", status: "error" } };
  const recovered = recoverFailedChatLogin(status);
  assert.equal(recovered.login, null);
  assert.match(recovered.error!, /ещё раз/);
  assert.equal(recovered.ready, false);
  assert.equal(status.login.userCode, "EXPIRED");
  const pending = { ...status, login: { ...status.login, status: "pending" } };
  assert.equal(recoverFailedChatLogin(pending), pending);
});

test("chat proxy accepts only named operations and opaque conversation IDs", () => {
  assert.equal(proxy.chatServicePath("GET", ["status"]), "/status");
  assert.equal(proxy.chatServicePath("POST", ["chats", "chat_123", "messages"]), "/chats/chat_123/messages");
  assert.equal(proxy.chatServicePath("DELETE", ["chats", "chat_123"]), "/chats/chat_123");
  for (const path of [["rpc"], ["chats", "..", "messages"], ["chats", "a/b"], ["chats", "id", "exec"], ["status", "extra"]]) assert.equal(proxy.chatServicePath("POST", path), null);
  assert.equal(proxy.chatServicePath("PUT", ["status"]), null);
});

test("message validation excludes RPC, tools and excessive input", () => {
  assert.deepEqual(proxy.chatRequestBody("/chats/id/messages", { text: "Привет", model: "gpt-5" }), { text: "Привет", model: "gpt-5" });
  for (const body of [null, [], { text: " ", model: "gpt-5" }, { text: "a".repeat(32_001), model: "gpt-5" }, { text: "hello", model: "gpt-5", tools: ["shell"] }, { text: "hello", model: "x".repeat(201) }]) assert.throws(() => proxy.chatRequestBody("/chats/id/messages", body));
  assert.throws(() => proxy.chatRequestBody("/login", { apiKey: "not-allowed" }));
  assert.throws(() => proxy.chatRequestBody("/chats", { title: "ok", cwd: "/" }));
  assert.deepEqual(proxy.chatRequestBody("/stop", {}), {});
});

test("proxy reads bounded bytes including UTF8 and cancels excessive streams", async () => {
  const bytes = new TextEncoder().encode("Привет");
  assert.equal(await proxy.readChatBody(new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }), bytes.length), "Привет");
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); }, cancel() { cancelled = true; } });
  await assert.rejects(proxy.readChatBody(stream, 3), /BODY_TOO_LARGE/);
  assert.equal(cancelled, true);
});

test("service origin cannot carry credentials, a different path, or a non-HTTP scheme", () => {
  assert.equal(proxy.chatServiceOrigin(undefined), "http://chat-service:3090");
  for (const origin of ["file:///etc/passwd", "http://u:p@host", "http://host/rpc", "http://host?path=/rpc"]) assert.throws(() => proxy.chatServiceOrigin(origin));
});

test("composer requires verified ready account, selected model, valid text and no running request", () => {
  const status = { configured: true, ready: true, account: { type: "chatgpt" }, login: null };
  assert.equal(canSendChat(status, "model", "Привет", false, false), true);
  assert.equal(canSendChat(null, "model", "hello", false, false), false);
  assert.equal(canSendChat({ ...status, ready: false }, "model", "hello", false, false), false);
  assert.equal(canSendChat(status, "", "hello", false, false), false);
  assert.equal(canSendChat(status, "model", "hello", true, false), false);
  assert.equal(canSendChat(status, "model", "hello", false, true), false);
  assert.equal(canSendChat(status, "model", "x".repeat(32_001), false, false), false);
});

test("model refresh retains valid choices and falls back to server default", () => {
  const models = [{ id: "a", name: "A" }, { id: "b", name: "B", default: true }];
  assert.equal(chooseChatModel(models, "a"), "a");
  assert.equal(chooseChatModel(models, "gone"), "b");
  assert.equal(chooseChatModel([], "a"), "");
});

test("mobile drawer tab boundaries wrap in both directions and recover escaped focus", () => {
  assert.equal(chatDrawerTabTarget(0, 4, true), 3);
  assert.equal(chatDrawerTabTarget(3, 4, false), 0);
  assert.equal(chatDrawerTabTarget(1, 4, false), null);
  assert.equal(chatDrawerTabTarget(2, 4, true), null);
  assert.equal(chatDrawerTabTarget(-1, 4, false), 0);
  assert.equal(chatDrawerTabTarget(-1, 4, true), 3);
  assert.equal(chatDrawerTabTarget(0, 1, true), 0);
  assert.equal(chatDrawerTabTarget(0, 1, false), 0);
  assert.equal(chatDrawerTabTarget(-1, 0, false), null);
});

test("device authentication links cannot redirect the admin to arbitrary websites", () => {
  assert.equal(safeDeviceLoginUrl("https://auth.openai.com/codex/device"), "https://auth.openai.com/codex/device");
  for (const url of ["javascript:alert(1)", "http://auth.openai.com", "https://auth.openai.com.evil.example", "https://u:p@chatgpt.com", "https://example.com"]) assert.equal(safeDeviceLoginUrl(url), null);
});

type Route = (request: Request, context: { params: Promise<{ path: string[] }> }) => Promise<Response>;
function loadRoute(authenticated: boolean, upstreamStatus = 200) {
  const calls: { url: string; options: RequestInit }[] = [];
  const source = readFileSync(new URL("../app/api/admin/chat/[[...path]]/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, Route> = {};
  vm.runInNewContext(compiled, {
    exports, Request, Response, URL, AbortSignal,
    process: { env: { VCOBS_CHAT_SERVICE_SECRET: "test-service-secret-at-least-32-characters" } },
    require: (name: string) => name === "next/headers" ? { cookies: async () => ({ get: () => ({ value: "session" }) }) } : name === "@/lib/admin-auth" ? { ADMIN_SESSION_COOKIE: "session", validateAdminSession: () => authenticated, originIsSameSite: (request: Request) => request.headers.get("origin") === "https://vcobs.test" } : name === "@/lib/admin-chat-proxy" ? proxy : (() => { throw new Error(`Unexpected import ${name}`); })(),
    fetch: async (url: string, options: RequestInit) => { calls.push({ url, options }); return Response.json(upstreamStatus === 200 ? { ready: true } : { error: "secret backend diagnostic" }, { status: upstreamStatus }); },
  });
  return { exports, calls };
}
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
test("every chat API operation denies guests before accessing upstream", async () => {
  const { exports, calls } = loadRoute(false);
  for (const method of ["GET", "POST", "DELETE"]) {
    const response = await exports[method](new Request("https://vcobs.test/api/admin/chat/status", { method }), context(["status"]));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(calls.length, 0);
});

test("chat mutations reject cross-origin calls, unknown operations and arbitrary body fields", async () => {
  const { exports, calls } = loadRoute(true);
  assert.equal((await exports.POST(new Request("https://vcobs.test/api/admin/chat/login", { method: "POST", headers: { origin: "https://evil.test" } }), context(["login"]))).status, 403);
  assert.equal((await exports.GET(new Request("https://vcobs.test/api/admin/chat/rpc"), context(["rpc"]))).status, 404);
  assert.equal((await exports.POST(new Request("https://vcobs.test/api/admin/chat/login", { method: "POST", headers: { origin: "https://vcobs.test", "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: "forbidden" }) }), context(["login"]))).status, 400);
  assert.equal(calls.length, 0);
});

test("chat API adds server-only authorization, disallows redirects and disables cache", async () => {
  const { exports, calls } = loadRoute(true);
  const response = await exports.GET(new Request("https://vcobs.test/api/admin/chat/status"), context(["status"]));
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, "http://chat-service:3090/status");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.cache, "no-store");
  assert.match(new Headers(calls[0].options.headers).get("authorization")!, /^Bearer /);
  assert.ok(calls[0].options.signal);
  assert.deepEqual(await response.json(), { ready: true });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("upstream authorization failures never expose backend diagnostics", async () => {
  const { exports } = loadRoute(true, 401);
  const response = await exports.GET(new Request("https://vcobs.test/api/admin/chat/status"), context(["status"]));
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /secret backend diagnostic/);
});
