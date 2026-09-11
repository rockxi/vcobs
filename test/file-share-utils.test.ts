import assert from "node:assert/strict";
import test from "node:test";

// Node's type-stripping test runner resolves the source file directly.
// @ts-expect-error TypeScript's bundler resolver intentionally disallows this extension.
const { MAX_SHARED_FILE_BYTES, decodeUploadFileName, encodeUploadFileName, formatSharedFileSize, isSharedFileSizeAllowed } = await import("../components/file-share-utils.ts");

test("accepts the exact client-side 500 MiB size limit", () => {
  assert.equal(MAX_SHARED_FILE_BYTES, 500 * 1024 * 1024);
  assert.equal(isSharedFileSizeAllowed(MAX_SHARED_FILE_BYTES), true);
  assert.equal(isSharedFileSizeAllowed(MAX_SHARED_FILE_BYTES + 1), false);
  assert.equal(isSharedFileSizeAllowed(-1), false);
});

test("formats file sizes for selected-file metadata", () => {
  assert.equal(formatSharedFileSize(0), "0 Б");
  assert.equal(formatSharedFileSize(1024), "1 КБ");
  assert.equal(formatSharedFileSize(1.5 * 1024 * 1024), "1,5 МБ");
  assert.equal(formatSharedFileSize(-1), "—");
});

test("round-trips Unicode file names through an ASCII-safe upload header", () => {
  const fileName = "Отчёт №1 — résumé 100%.pdf";
  const encoded = encodeUploadFileName(fileName);
  assert.match(encoded, /^[\x00-\x7f]+$/);
  assert.equal(decodeUploadFileName(encoded), fileName);
});

test("falls back safely when the encoded file-name header is malformed", () => {
  assert.equal(decodeUploadFileName("%E0%A4%A"), "file");
  assert.equal(decodeUploadFileName(null), "file");
});
