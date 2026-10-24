import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { readFile } from "node:fs/promises";
import ts from "typescript";
// @ts-ignore Node's built-in type stripping requires the source extension.
import { readThemePreference, resolveThemePreference, themeBootstrapScript, themeStorageKey, writeThemePreference } from "../lib/theme-preference.ts";

const config = { ids: ["obsidianite", "neon-grid", "frutiger-aero"], enabled: ["obsidianite", "frutiger-aero"], defaultId: "obsidianite" };

test("theme resolution retains available choices and safely rejects invalid or disabled preferences", () => {
  assert.equal(resolveThemePreference("frutiger-aero", "/p/123", config), "frutiger-aero");
  for (const value of [null, "", "unknown", "neon-grid", "</script>"]) {
    assert.equal(resolveThemePreference(value, "/", config), "obsidianite");
  }
  assert.equal(resolveThemePreference(null, "/", { ...config, enabled: ["frutiger-aero"] }), "frutiger-aero");
  assert.equal(resolveThemePreference(null, "/", { ...config, enabled: [] }), "obsidianite");
});

test("admin preview can use every registered theme without exposing disabled themes on guest routes", () => {
  for (const path of ["/admin", "/admin/components", "/admin/chat"]) {
    assert.equal(resolveThemePreference("neon-grid", path, config), "neon-grid");
  }
  for (const path of ["/administrator", "/admin-note", "/files/test", "/note"]) {
    assert.equal(resolveThemePreference("neon-grid", path, config), "obsidianite");
  }
});

test("storage access failure leaves preference helpers usable", () => {
  assert.equal(readThemePreference({ getItem() { throw new Error("denied"); } }), null);
  assert.doesNotThrow(() => writeThemePreference({ setItem() { throw new Error("quota"); } }, "frutiger-aero"));
  let saved: unknown;
  writeThemePreference({ setItem(key, value) { saved = [key, value]; } }, "frutiger-aero");
  assert.deepEqual(saved, [themeStorageKey, "frutiger-aero"]);
});

test("pre-hydration bootstrap applies the same theme policy on direct routes", () => {
  for (const [pathname, stored, expected] of [
    ["/", "frutiger-aero", "frutiger-aero"],
    ["/admin/components", "neon-grid", "neon-grid"],
    ["/p/123", "neon-grid", "obsidianite"],
    ["/admin/chat", "unknown", "obsidianite"],
  ]) {
    const dataset: Record<string, string> = {};
    runInNewContext(themeBootstrapScript(config), {
      window: { location: { pathname }, localStorage: { getItem: () => stored } },
      document: { documentElement: { dataset } },
    });
    assert.equal(dataset.vcobsTheme, expected);
  }
});

test("bootstrap survives a throwing localStorage getter and cannot embed script-breaking configuration", () => {
  const dataset: Record<string, string> = {};
  runInNewContext(themeBootstrapScript(config), {
    window: { location: { pathname: "/" }, get localStorage() { throw new Error("denied"); } },
    document: { documentElement: { dataset } },
  });
  assert.equal(dataset.vcobsTheme, "obsidianite");
  const unsafe = "</script><script>alert(1)</script>\u2028\u2029";
  const script = themeBootstrapScript({ ids: [unsafe], enabled: [unsafe], defaultId: unsafe });
  assert.doesNotMatch(script, /<\/script|\u2028|\u2029/);
  runInNewContext(script, { window: { location: { pathname: "/" }, localStorage: { getItem: () => null } }, document: { documentElement: { dataset } } });
  assert.equal(dataset.vcobsTheme, unsafe);
});

test("every route and both selectors share the root provider with storage event synchronization", async () => {
  const [layout, provider, picker, library] = await Promise.all([
    "../app/layout.tsx", "../components/theme-provider.tsx", "../components/public-theme-picker.tsx", "../components/component-library.tsx",
  ].map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  assert.match(layout, /<head><script dangerouslySetInnerHTML/);
  assert.match(layout, /<ThemeProvider enabled=\{enabled\}><ThemeBackdrop \/>\{children\}<\/ThemeProvider>/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(picker, /useTheme\(\)/);
  assert.match(library, /useTheme\(\)/);
  assert.doesNotMatch(picker + library, /localStorage/);
  assert.match(provider, /window.addEventListener\("storage", synchronize\)/);
  assert.match(provider, /window.removeEventListener\("storage", synchronize\)/);
  assert.match(provider, /event.key !== themeStorageKey && event.key !== null/);
});

test("public sidebar mounts and toggles when browser storage getters or methods throw", async () => {
  const source = await readFile(new URL("../components/vault-tree.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const mode of ["getter-denied", "methods-denied", "available"]) {
    const effects: (() => void)[] = [];
    const states: unknown[] = [];
    const writes: [string, string][] = [];
    const browser = Object.defineProperty({}, "localStorage", { get() {
      if (mode === "getter-denied") throw new Error("SecurityError");
      return {
        getItem() { if (mode === "methods-denied") throw new Error("SecurityError"); return "collapsed"; },
        setItem(key: string, value: string) { if (mode === "methods-denied") throw new Error("QuotaExceededError"); writes.push([key, value]); },
      };
    } });
    const exports: Record<string, any> = {};
    const jsx = (type: unknown, props: unknown) => ({ type, props });
    runInNewContext(compiled, { exports, window: browser, require(name: string) {
      if (name === "react") return {
        useMemo: (callback: () => unknown) => callback(),
        useRef: (current: unknown) => ({ current }),
        useEffect: (callback: () => void) => effects.push(callback),
        useState(initial: unknown) {
          const index = states.push(initial) - 1;
          return [initial, (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
        },
      };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { default: "a" };
      if (name === "@/components/public-theme-picker") return { PublicThemePicker: () => null };
      throw new Error(`Unexpected dependency: ${name}`);
    } });
    const tree = exports.VaultTree({ notes: [] });
    assert.doesNotThrow(() => effects[0](), mode);
    assert.equal(states[2], mode === "available", mode);
    assert.doesNotThrow(() => tree.props.children[0].props.onClick(), mode);
    assert.equal(states[2], mode !== "available", mode);
    assert.deepEqual(writes, mode === "available" ? [["vcobs-sidebar", "open"]] : [], mode);
  }
});
