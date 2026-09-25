import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = new URL("../app/admin/components/page.tsx", import.meta.url);

test("component library page applies the shared server-side admin session guard", async () => {
  const source = await readFile(page, "utf8");
  assert.match(source, /ADMIN_SESSION_COOKIE, validateAdminSession/);
  assert.match(source, /if \(!validateAdminSession\(\(await cookies\(\)\)\.get\(ADMIN_SESSION_COOKIE\)\?\.value\)\) redirect\("\/admin"\)/);
});

test("admin session module uses webpack-compatible Node builtin specifiers", async () => {
  const authSource = await readFile(new URL("../lib/admin-auth.ts", import.meta.url), "utf8");
  assert.doesNotMatch(authSource, /node:(?:crypto|net)/);
});

test("component library exposes canonical component names", async () => {
  const source = await readFile(page, "utf8");
  for (const name of ["button", "text_input", "textarea", "link", "status_badge", "notice"]) assert.match(source, new RegExp(`name: "${name}"`));
});
