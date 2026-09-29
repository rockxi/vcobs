import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = new URL("../app/admin/vault/page.tsx", import.meta.url);
const workspace = new URL("../components/admin-vault-workspace.tsx", import.meta.url);
const tree = new URL("../components/admin-vault-tree.tsx", import.meta.url);
const publicEditor = new URL("../components/admin-note-editor.tsx", import.meta.url);
const hub = new URL("../app/admin/page.tsx", import.meta.url);
const css = new URL("../app/globals.css", import.meta.url);

test("vault page checks the admin session before rendering the workspace", async () => {
  const source = await readFile(page, "utf8");
  assert.match(source, /validateAdminSession\(\(await cookies\(\)\)\.get\(ADMIN_SESSION_COOKIE\)\?\.value\)/);
  assert.match(source, /redirect\("\/admin"\)/);
});

test("vault workspace edits one document at a time with guarded navigation and revision saves", async () => {
  const source = await readFile(workspace, "utf8");
  assert.match(source, /window\.confirm\("Есть несохранённые правки/);
  assert.match(source, /beforeunload/);
  assert.match(source, /method: "PUT"/);
  assert.match(source, /revision: source\.revision/);
  assert.match(source, /documentId=\{source\.id\}/);
  assert.match(source, /event\.metaKey \|\| event\.ctrlKey/);
});

test("admin explorer searches paths and renders folders with only indexed files", async () => {
  const [treeSource, hubSource, editorSource] = await Promise.all([readFile(tree, "utf8"), readFile(hub, "utf8"), readFile(publicEditor, "utf8")]);
  assert.match(treeSource, /entry\.path\.toLocaleLowerCase/);
  assert.match(treeSource, /parts\.slice\(0, -1\)/);
  assert.match(treeSource, /<details className="admin-vault-folder"/);
  assert.match(hubSource, /href: "\/admin\/vault", name: "Редактор заметок"/);
  assert.match(editorSource, /<LivePreviewEditor/);
  assert.doesNotMatch(editorSource, /<textarea|ReactMarkdown/);
});

test("vault editor fills the content panel and Excalidraw notice matches its filename", async () => {
  const [styles, source] = await Promise.all([readFile(css, "utf8"), readFile(workspace, "utf8")]);
  assert.match(styles, /\.admin-vault-document \{ width:100%; min-width:0;/);
  assert.match(styles, /\.admin-vault-editor \{ width:100%;/);
  assert.doesNotMatch(styles, /\.admin-vault-document \{ width:min\(/);
  assert.match(source, /\\\.excalidraw\\\.md\$\/i\.test\(source\.path\)/);
  assert.doesNotMatch(source, /source\.type === "excalidraw"/);
});
