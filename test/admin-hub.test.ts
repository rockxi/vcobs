import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const adminPage = new URL("../app/admin/page.tsx", import.meta.url);
const loginRoute = new URL("../app/api/admin/login/route.ts", import.meta.url);
const adminCss = new URL("../app/globals.css", import.meta.url);

test("admin page renders a session-protected hub with links to every existing admin section", async () => {
  const source = await readFile(adminPage, "utf8");
  assert.match(source, /validateAdminSession\(\(await cookies\(\)\)\.get\(ADMIN_SESSION_COOKIE\)\?\.value\)/);
  assert.match(source, /const adminSections = \[/);
  assert.match(source, /href: "\/admin\/links"/);
  assert.match(source, /href: "\/admin\/components"/);
  assert.match(source, /action="\/api\/admin\/logout" method="post"/);
  assert.doesNotMatch(source, /redirect\("\/admin\/links"\)/);
});

test("successful login returns to the admin hub and login remains available to guests", async () => {
  const [pageSource, routeSource] = await Promise.all([readFile(adminPage, "utf8"), readFile(loginRoute, "utf8")]);
  assert.match(pageSource, /Вход администратора/);
  assert.match(pageSource, /<form action="\/api\/admin\/login" method="post" className="admin-form">/);
  assert.match(routeSource, /error \? `\/admin\?error=\$\{error\}` : "\/admin"/);
  assert.doesNotMatch(routeSource, /"\/admin\/links"/);
});

test("admin hub styles provide visible keyboard focus and a one-column mobile layout", async () => {
  const source = await readFile(adminCss, "utf8");
  assert.match(source, /\.admin-hub-link:focus-visible/);
  assert.match(source, /@media \(max-width:620px\) \{ \.admin-hub-header/);
  assert.match(source, /\.admin-hub-grid \{ grid-template-columns:1fr;/);
});
