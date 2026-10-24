import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { chromeFragmentShader, chromeRenderPolicy, chromeRenderSize, chromeToneMap, createChromeGeometry } from "../lib/liquid-chrome-renderer.ts";
import { themeCssVariables, themeStyleSheet, vcobsThemes } from "../lib/themes.ts";

test("chrome is an additional registry theme with dark reading surfaces and contrasting actions", () => {
  const chrome = vcobsThemes.find(theme => theme.id === "liquid-chrome");
  assert.ok(chrome); assert.ok(vcobsThemes.some(theme => theme.id === "liquid-glass"));
  assert.equal(Object.keys(chrome.tokens).length, 8);
  const roles = themeCssVariables(chrome);
  assert.equal(roles["--document-bg"], "#0a101b");
  assert.equal(roles["--on-action"], "#09111f");
  assert.match(roles["--control-gradient"], /linear-gradient/);
  assert.match(themeStyleSheet(), /html\[data-vcobs-theme="liquid-chrome"\]/);
});

test("mesh has closed seams, finite unit normals and bounded valid triangle indices", () => {
  const mesh = createChromeGeometry();
  assert.equal(mesh.positions.length, 193 * 25 * 3);
  assert.equal(mesh.indices.length, 192 * 24 * 6);
  for (const value of mesh.positions) assert.ok(Number.isFinite(value));
  for (let i = 0; i < mesh.normals.length; i += 3) assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(i, i + 3)) - 1) < .0001);
  for (const index of mesh.indices) assert.ok(index < mesh.positions.length / 3);
  for (let side = 0; side < 25; side++) for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(mesh.positions[side * 3 + axis] - mesh.positions[(192 * 25 + side) * 3 + axis]) < .0001);
  assert.throws(() => createChromeGeometry(512, 512), RangeError);
});

test("GPU render policy stays within pixel and DPR limits at desktop/mobile/large displays", () => {
  for (const [width, height, dpr] of [[390, 844, 3], [1440, 1000, 2], [7680, 4320, 3], [0, 0, NaN]]) {
    const size = chromeRenderSize(width, height, dpr);
    assert.ok(size.width >= 1 && size.height >= 1);
    assert.ok(size.width * size.height <= chromeRenderPolicy.maxPixels);
    assert.ok(size.width <= Math.max(1, width) * chromeRenderPolicy.maxDpr);
  }
  assert.equal(chromeRenderPolicy.framesPerSecond, 24);
});

test("mirror tone mapping keeps negative fill dark and HDR reflections white", () => {
  assert.equal(chromeToneMap(0), 0);
  assert.equal(chromeToneMap(-1), 0);
  assert.ok(chromeToneMap(.004) < .002);
  assert.ok(chromeToneMap(3.2) > .95);
  assert.ok(chromeToneMap(100) <= 1);
  const ramp = [0, .004, .02, .1, .5, 1, 3.2, 10].map(chromeToneMap);
  assert.ok(ramp.every((value, index) => index === 0 || value >= ramp[index - 1]));
  assert.match(chromeFragmentShader, /linear\*\(2\.51\*linear\+0\.03\)/);
  assert.doesNotMatch(chromeFragmentShader, /metal\/\(vec3\(\.65\)/);
});

test("only the chrome branch loads the renderer and lifecycle releases GPU resources", async () => {
  const backdrop = await readFile(new URL("../components/theme-backdrop.tsx", import.meta.url), "utf8");
  assert.match(backdrop, /dynamic\(\(\) => import/);
  assert.match(backdrop, /theme.id === "liquid-chrome" \? <LiquidChromeScene \/> : null/);
  const renderer = await readFile(new URL("../lib/liquid-chrome-renderer.ts", import.meta.url), "utf8");
  for (const required of ["deleteBuffer", "deleteShader", "deleteProgram", "visibilitychange", "prefers-reduced-motion", "webglcontextlost", "cancelAnimationFrame", "loseContext"]) assert.ok(renderer.includes(required));
});
