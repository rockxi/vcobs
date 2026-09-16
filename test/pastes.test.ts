import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const testDirectory = await mkdtemp(path.join(tmpdir(), "vcobs-pastes-"));
process.env.PASTE_DATA_DIR = testDirectory;
// @ts-expect-error TypeScript's bundler resolver intentionally disallows this extension.
const pastes = await import("../lib/pastes.ts");

test.after(async () => rm(testDirectory, { recursive: true, force: true }));
test.afterEach(async () => { await rm(testDirectory, { recursive: true, force: true }); await mkdir(testDirectory, { recursive: true }); });

test("old paste records without editable remain read-only", async () => {
  const createdAt = new Date().toISOString();
  await writeFile(path.join(testDirectory, "legacy123.json"), JSON.stringify({ text: "old", createdAt }));
  assert.deepEqual(await pastes.getPaste("legacy123"), { text: "old", createdAt, editable: false });
  assert.equal(await pastes.updatePaste("legacy123", "new"), "read-only");
});

test("creates editable and read-only pastes and updates only editable text", async () => {
  const editableSlug = await pastes.createPaste("first", true);
  const readOnlySlug = await pastes.createPaste("first");
  const before = await pastes.getPaste(editableSlug);
  assert.equal(before?.editable, true);
  assert.equal((await pastes.getPaste(readOnlySlug))?.editable, false);
  assert.equal(await pastes.updatePaste(editableSlug, "second"), "updated");
  const after = await pastes.getPaste(editableSlug);
  assert.equal(after?.text, "second");
  assert.equal(after?.createdAt, before?.createdAt);
  assert.equal(await pastes.updatePaste(readOnlySlug, "second"), "read-only");
});

test("rejects empty, oversized, expired, and invalid-slug updates", async () => {
  const slug = await pastes.createPaste("first", true);
  assert.equal(await pastes.updatePaste(slug, "   "), "invalid-text");
  assert.equal(await pastes.updatePaste(slug, "x".repeat(pastes.MAX_PASTE_LENGTH + 1)), "too-large");
  await writeFile(path.join(testDirectory, "expired123.json"), JSON.stringify({ text: "old", editable: true, createdAt: new Date(Date.now() - pastes.PASTE_TTL_MS - 1).toISOString() }));
  assert.equal(await pastes.updatePaste("expired123", "new"), "not-found");
  assert.equal(await pastes.updatePaste("bad/slash", "new"), "not-found");
});

test("atomic saves never expose corrupt JSON while concurrent readers run", async () => {
  const slug = await pastes.createPaste("initial", true);
  const saves = Array.from({ length: 40 }, (_, index) => pastes.updatePaste(slug, `version-${index}`));
  const reads = Array.from({ length: 80 }, async () => {
    const paste = await pastes.getPaste(slug);
    assert.ok(paste);
    assert.match(paste.text, /^(initial|version-\d+)$/);
  });
  assert.deepEqual(await Promise.all(saves), Array.from({ length: 40 }, () => "updated"));
  await Promise.all(reads);
  const raw = await readFile(path.join(testDirectory, `${slug}.json`), "utf8");
  assert.doesNotThrow(() => JSON.parse(raw));
  assert.equal((await pastes.getPaste(slug))?.createdAt !== undefined, true);
});

test("a deleted or expired record is never recreated by an update", async () => {
  const slug = await pastes.createPaste("initial", true);
  await rm(path.join(testDirectory, `${slug}.json`));
  assert.equal(await pastes.updatePaste(slug, "replacement"), "not-found");
  await assert.rejects(readFile(path.join(testDirectory, `${slug}.json`), "utf8"));

  await writeFile(path.join(testDirectory, "boundary123.json"), JSON.stringify({ text: "old", editable: true, createdAt: new Date(Date.now() - pastes.PASTE_TTL_MS).toISOString() }));
  assert.equal(await pastes.updatePaste("boundary123", "replacement"), "not-found");
  await assert.rejects(readFile(path.join(testDirectory, "boundary123.json"), "utf8"));
});
