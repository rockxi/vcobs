import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = new URL("../app/admin/components/page.tsx", import.meta.url);
const library = new URL("../components/component-library.tsx", import.meta.url);
const themes = new URL("../lib/themes.ts", import.meta.url);

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
  const source = await readFile(library, "utf8");
  for (const name of ["button", "text_input", "textarea", "link", "status_badge", "notice"]) assert.match(source, new RegExp(`name: "${name}"`));
});

test("component library has an accessible selector backed by the shared vcobs theme registry", async () => {
  const [librarySource, themeSource] = await Promise.all([readFile(library, "utf8"), readFile(themes, "utf8")]);
  assert.match(librarySource, /<select id="vcobs-theme"/);
  assert.match(librarySource, /onChange=\{\(event\) => setThemeId/);
  assert.match(librarySource, /aria-describedby="vcobs-theme-description"/);
  assert.match(librarySource, /themeCssVariables\(theme\)/);
  assert.match(themeSource, /export const vcobsThemes/);
  assert.match(themeSource, /defaultVcobsTheme/);
});

test("Neon Grid is a reusable theme and the component demo exposes stateful samples", async () => {
  const [librarySource, themeSource] = await Promise.all([readFile(library, "utf8"), readFile(themes, "utf8")]);
  assert.match(themeSource, /id: "neon-grid"/);
  assert.match(themeSource, /name: "Neon Grid"/);
  assert.match(librarySource, /aria-invalid="true"/);
  assert.match(librarySource, /disabled>Недоступно/);
});

test("Frutiger Aero is a shared glossy theme with representative success and error states", async () => {
  const [librarySource, themeSource, cssSource] = await Promise.all([readFile(library, "utf8"), readFile(themes, "utf8"), readFile(new URL("../app/globals.css", import.meta.url), "utf8")]);
  assert.match(themeSource, /id: "frutiger-aero"/);
  assert.match(themeSource, /name: "Frutiger Aero"/);
  assert.match(librarySource, /component-button-success/);
  assert.match(librarySource, /component-input-success/);
  assert.match(cssSource, /data-vcobs-theme="frutiger-aero"/);
  assert.match(cssSource, /prefers-reduced-motion:reduce/);
});
