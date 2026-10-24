import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { defaultVcobsTheme, themeCssVariables, themeScheme, themeStyleSheet, vcobsThemes } from "../lib/themes.ts";

const files = ["app/globals.css", "components/live-preview-editor.module.css", "app/admin/chat/chat.module.css"];
const sources = await Promise.all(files.map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));

function sharedBlocks(source: string) {
  return Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g)).filter(([, raw]) => {
    const selector = raw.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    // These are selected-theme material/illustration definitions, not shared chrome.
    return !selector.includes("data-vcobs-theme") && !/glass-material-|aero-|neon-/.test(selector);
  });
}

test("shared route/editor/chat chrome has no independent literal palette", () => {
  for (const [index, source] of sources.entries()) {
    for (const [, selector, body] of sharedBlocks(source)) {
      assert.doesNotMatch(body, /#[\da-f]{3,8}\b|\brgba?\(|(?:color|background)\s*:\s*(?:white|black)\b/i, `${files[index]} ${selector.trim()}`);
    }
  }
  assert.doesNotMatch(sources[0], /data-vcobs-theme\]:not\(/, "No route-subset palette repair may override semantic roles");
});

test("every theme defines all roles referenced by shared controls without variable cycles", () => {
  const referenced = new Set(sources.flatMap((source) => sharedBlocks(source).flatMap(([, , body]) => Array.from(body.matchAll(/var\((--[\w-]+)/g), ([, name]) => name))));
  const declared = new Set(sources.flatMap((source) => Array.from(source.matchAll(/(--[\w-]+)\s*:/g), ([, name]) => name)));
  for (const theme of vcobsThemes) {
    const variables = themeCssVariables(theme);
    for (const name of referenced) assert.ok(name in variables || declared.has(name) || name === "--ui-font" || name === "--toggle-drag", `${theme.id} lacks ${name}`);
    function visit(name: string, trail: string[] = []) {
      assert.ok(!trail.includes(name), `Variable cycle: ${[...trail, name].join(" -> ")}`);
      for (const [, dependency] of (variables[name] ?? "").matchAll(/var\((--[\w-]+)/g)) {
        assert.ok(dependency in variables, `${theme.id} ${name} lacks ${dependency}`);
        visit(dependency, [...trail, name]);
      }
    }
    for (const name of Object.keys(variables)) visit(name);
    for (const role of ["on-action", "error-fg", "success-fg", "selection-bg", "focus-ring", "input-bg", "control-gradient", "control-radius"]) assert.ok(variables[`--${role}`]);
    assert.equal(Object.keys(theme.tokens).length, 8, "Semantic roles must not expand the component demo's eight palette labels");
  }
});

test("server stylesheet includes the default and every theme with an explicit browser scheme", () => {
  const stylesheet = themeStyleSheet();
  assert.ok(stylesheet.startsWith(":root,html[data-vcobs-theme=\"obsidianite\"]"));
  assert.doesNotMatch(stylesheet, /[<>]/, "Only application-owned CSS can enter the head");
  for (const theme of vcobsThemes) {
    assert.ok(stylesheet.includes(`html[data-vcobs-theme="${theme.id}"]`));
    assert.ok(stylesheet.includes(`color-scheme:${themeScheme(theme)}`));
  }
  assert.equal(themeScheme(defaultVcobsTheme), "dark");
  assert.equal(themeScheme(vcobsThemes.find((theme) => theme.id === "frutiger-aero")!), "light");
  assert.equal(defaultVcobsTheme.tokens.paper, "#12131a", "Keep the established Obsidianite shell");
});

test("primary actions have an explicit contrasting foreground in every palette", () => {
  for (const theme of vcobsThemes) {
    const variables = themeCssVariables(theme);
    function resolve(value: string): string {
      const reference = /^var\((--[\w-]+)\)$/.exec(value);
      return reference ? resolve(variables[reference[1]]) : value;
    }
    function luminance(value: string) {
      assert.match(value, /^#[\da-f]{6}$/i);
      const channels = [1, 3, 5].map((offset) => {
        const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    }
    const pair = [luminance(resolve(variables["--action-bg"])), luminance(resolve(variables["--on-action"]))];
    assert.ok((Math.max(...pair) + .05) / (Math.min(...pair) + .05) >= 4.5, `${theme.id} primary action contrast`);
  }
});

test("scene and remote pixels are not recolored by application theme CSS", async () => {
  const drawing = await readFile(new URL("../components/excalidraw-viewer.tsx", import.meta.url), "utf8");
  assert.match(drawing, /theme=\{themeScheme\(theme\)\}/);
  assert.match(drawing, /toggleTheme: false/);
  assert.doesNotMatch(drawing, /viewBackgroundColor:|elements:/);
  for (const [, selector, body] of sharedBlocks(sources[0])) {
    if (/canvas\b|\.prose img\b/.test(selector)) {
      assert.doesNotMatch(body, /(?:^|;)\s*(?:filter|mix-blend-mode)\s*:/);
    }
  }
  assert.match(sources[2], /\.markdown pre code\s*\{[^}]*color:inherit/);
});

test("transparent remote actions override admin primary-action foregrounds", () => {
  const source = sources[0];
  const neutral = source.match(/\.remote-toolbar \.remote-plain-button\s*\{([^}]+)\}/);
  assert.ok(neutral, "Neutral remote actions need two class selectors to outrank .admin-shell button");
  assert.match(neutral[1], /color:var\(--control-foreground\)/);
  assert.match(source, /\.remote-plain-button\s*\{[^}]*background:transparent!important/);
  assert.ok(source.indexOf(neutral[0]) > source.indexOf(".admin-shell button {"));
});

test("the final mobile shell cascade restores a shrinkable single column", () => {
  const source = sources[0];
  const finalMobile = source.slice(source.lastIndexOf("@media (max-width:720px)"));
  assert.match(finalMobile, /\.vault-layout,\.vault-layout:has\(\.vault-sidebar-collapsed\)\s*\{\s*grid-template-columns:minmax\(0,1fr\)/);
  assert.ok(source.lastIndexOf("@media (max-width:720px)") > source.lastIndexOf("grid-template-columns:308px"));
});

test("unmatched routes receive the current server theme availability policy", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  assert.match(layout, /getEnabledThemes\(/);
  assert.match(layout, /ThemeProvider enabled=\{enabled\}/);
});
