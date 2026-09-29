import assert from "node:assert/strict";
import test from "node:test";
import xxhash from "xxhash-wasm";
// @ts-expect-error TypeScript's bundler resolver intentionally disallows this extension.
const { liveSyncChunks, splitLiveSyncText } = await import("../lib/livesync-edit.ts");

test("chunked Markdown round-trips exactly, including Cyrillic and astral Unicode", async () => {
  const source = "---\nvcobs-link: test-note\n---\n" + "Привет 😀\n".repeat(1600);
  const pieces = splitLiveSyncText(source);
  assert.ok(pieces.length > 1);
  assert.ok(pieces.every((piece: string) => piece.length <= 8192));
  assert.equal(pieces.join(""), source);
  const chunks = await liveSyncChunks(source);
  assert.equal(chunks.map((chunk: { data: string }) => chunk.data).join(""), source);
  assert.ok(chunks.every((chunk: { _id: string; type: string }) => /^h:[a-z0-9]+$/.test(chunk._id) && chunk.type === "leaf"));
});

test("chunk IDs follow LiveSync's unencrypted xxhash64 convention", async () => {
  const hash = await xxhash();
  const [chunk] = await liveSyncChunks("Hello, LiveSync!");
  assert.equal(chunk._id, `h:${hash.h64("Hello, LiveSync!-16").toString(36)}`);
  assert.deepEqual(await liveSyncChunks(""), []);
  assert.deepEqual(await liveSyncChunks("Hello, LiveSync!"), [chunk]);
});
