import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const directory = await mkdtemp(path.join(tmpdir(), "vcobs-private-pastes-"));
process.env.PASTE_DATA_DIR = directory;
process.env.VCOBS_ADMIN_SESSION_SECRET = "private-paste-test-session-secret-at-least-32-characters";
process.env.VCOBS_TRUST_PROXY_HEADERS = "false";
// @ts-expect-error TypeScript's bundler resolver intentionally disallows this extension.
const pastes = await import("../lib/pastes.ts");
// @ts-expect-error TypeScript's bundler resolver intentionally disallows this extension.
const auth = await import("../lib/admin-auth.ts");
test.after(async () => rm(directory, { recursive: true, force: true }));

type Route = (request: Request, context: { params: Promise<{ slug: string }> }) => Promise<Response>;
function loadRoute(file: string): Record<string, Route> {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, Route> = {};
  vm.runInNewContext(compiled, {
    exports, Request, Response,
    require: (name: string) => name === "next/server" ? { NextResponse: Response } : name === "@/lib/admin-auth" ? auth : name === "@/lib/pastes" ? pastes : (() => { throw new Error(`Unexpected import ${name}`); })(),
  });
  return exports;
}
const create = loadRoute("../app/api/pastes/route.ts").POST;
const update = loadRoute("../app/api/pastes/[slug]/route.ts").PUT;
const context = (slug = "unused123") => ({ params: Promise.resolve({ slug }) });
function request(body: object, method = "POST", session?: string, origin: string | null = "https://vcobs.test") {
  return new Request("https://vcobs.test/api/pastes", { method, headers: {
    "content-type": "application/json",
    ...(session ? { cookie: `${auth.ADMIN_SESSION_COOKIE}=${session}` } : {}),
    ...(origin ? { origin } : {}),
  }, body: JSON.stringify(body) });
}

test("private creation denies absent, forged and expired admin sessions without allocating records", async () => {
  const before = await readdir(directory);
  for (const session of [undefined, "forged-session", auth.createAdminSession(Date.now() - 9 * 60 * 60 * 1000)!]) {
    assert.equal((await create(request({ text: "private", adminOnly: true }, "POST", session), context())).status, 401);
  }
  assert.deepEqual(await readdir(directory), before);
});

test("private creation requires same origin and rejects malformed privacy flags", async () => {
  const session = auth.createAdminSession()!;
  const before = await readdir(directory);
  for (const origin of [null, "https://evil.test", "http://vcobs.test"]) {
    assert.equal((await create(request({ text: "private", adminOnly: true }, "POST", session, origin), context())).status, 403);
  }
  for (const adminOnly of [null, "true", "false", 0, {}, []]) {
    assert.equal((await create(request({ text: "private", adminOnly }, "POST", session), context())).status, 400);
  }
  assert.deepEqual(await readdir(directory), before);
});

test("private creation and private edits require real authorized same-origin sessions", async () => {
  const session = auth.createAdminSession()!;
  const created = await create(request({ text: "private secret", editable: true, adminOnly: true }, "POST", session), context());
  assert.equal(created.status, 201);
  const { slug } = await created.json();
  assert.equal((await pastes.getPaste(slug))?.adminOnly, true);
  for (const token of [undefined, "forged-session", auth.createAdminSession(Date.now() - 9 * 60 * 60 * 1000)!]) {
    assert.equal((await update(request({ text: "guest overwrite" }, "PUT", token), context(slug))).status, 404);
  }
  for (const origin of [null, "https://evil.test"]) {
    assert.equal((await update(request({ text: "CSRF overwrite" }, "PUT", session, origin), context(slug))).status, 404);
  }
  assert.equal((await pastes.getPaste(slug))?.text, "private secret");
  assert.equal((await update(request({ text: "admin edit", adminOnly: false }, "PUT", session), context(slug))).status, 200);
  assert.equal((await pastes.getPaste(slug))?.adminOnly, true);
  assert.equal((await pastes.getPaste(slug))?.text, "admin edit");
});

test("public guest publishing and link editing still work without admin authentication", async () => {
  const created = await create(request({ text: "public", editable: true }, "POST", undefined, null), context());
  assert.equal(created.status, 201);
  const { slug } = await created.json();
  assert.equal((await pastes.getPaste(slug))?.adminOnly, false);
  assert.equal((await update(request({ text: "public guest edit" }, "PUT", undefined, null), context(slug))).status, 200);
});

test("publication retains selected privacy even if the admin prop changes before submit", () => {
  const source = readFileSync(new URL("../components/paste-form.tsx", import.meta.url), "utf8");
  assert.match(source, /body: JSON\.stringify\(\{ text, editable, adminOnly \}\)/);
  assert.doesNotMatch(source, /adminOnly:\s*isAdmin\s*&&\s*adminOnly/);
});

test("private page denies guests before generating content or client component props", () => {
  const source = readFileSync(new URL("../app/[slug]/page.tsx", import.meta.url), "utf8");
  const guard = source.indexOf("if (paste.adminOnly && !validateAdminSession");
  const markup = source.indexOf('return <main className="reader-shell">');
  assert.ok(guard > 0 && guard < markup);
  assert.match(source.slice(guard, markup), /notFound\(\)/);
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.ok(source.indexOf("initialText={paste.text}") > guard);
});
