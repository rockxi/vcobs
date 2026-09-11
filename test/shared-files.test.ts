import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const testDirectory = await mkdtemp(path.join(tmpdir(), "vcobs-shared-files-"));
process.env.SHARED_FILES_DATA_DIR = testDirectory;
// Node's type-stripping test runner resolves the source file directly.
// @ts-expect-error TypeScript's bundler resolver intentionally disallows this extension.
const sharedFiles = await import("../lib/shared-files.ts");
const {
  MAX_SHARED_FILE_BYTES,
  SHARED_FILE_TTL_MS,
  SharedFileTooLargeError,
  deleteExpiredSharedFiles,
  getSharedFile,
  sanitizeSharedContentType,
  sanitizeSharedFileName,
  storeSharedFile,
} = sharedFiles;

function streamFrom(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

test.after(async () => rm(testDirectory, { recursive: true, force: true }));
test.afterEach(async () => {
  await rm(testDirectory, { recursive: true, force: true });
  await mkdir(testDirectory, { recursive: true });
});

test("uses the exact 500 MiB production limit and enforces streaming boundaries", async () => {
  assert.equal(MAX_SHARED_FILE_BYTES, 500 * 1024 * 1024);
  const accepted = await storeSharedFile({ stream: streamFrom(new Uint8Array([1, 2, 3])), fileName: "ok.bin", maxBytes: 3 });
  assert.equal(accepted.size, 3);
  await assert.rejects(
    storeSharedFile({ stream: streamFrom(new Uint8Array([1, 2]), new Uint8Array([3, 4])), fileName: "too-large.bin", maxBytes: 3 }),
    SharedFileTooLargeError,
  );
});

test("stores raw bytes while sanitizing file names and content types", async () => {
  const original = new Uint8Array([0, 255, 1, 2, 3]);
  const stored = await storeSharedFile({ stream: streamFrom(original), fileName: "..\\folder/evil?.txt", contentType: "text/plain\r\nX-Injected: yes" });
  assert.equal(stored.fileName, "evil_.txt");
  assert.equal(stored.contentType, "application/octet-stream");
  assert.deepEqual(await readFile(stored.path), Buffer.from(original));
  assert.equal(sanitizeSharedFileName("../../.hidden"), ".hidden");
  assert.equal(sanitizeSharedContentType("image/png; charset=binary"), "image/png");
});

test("expires after 12 hours and removes expired data", async () => {
  assert.equal(SHARED_FILE_TTL_MS, 12 * 60 * 60 * 1000);
  const stored = await storeSharedFile({ stream: streamFrom(new Uint8Array([7])), fileName: "expire.bin" });
  const createdAt = Date.parse(stored.createdAt);
  assert.equal(await getSharedFile(stored.slug, createdAt + SHARED_FILE_TTL_MS), null);
  assert.equal((await readdir(testDirectory)).some((file) => file.startsWith(stored.slug)), false);
});

test("cleans partial files when the input stream fails", async () => {
  const failingStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.error(new Error("interrupted upload"));
    },
  });
  await assert.rejects(storeSharedFile({ stream: failingStream, fileName: "partial.bin" }), /interrupted upload/);
  assert.deepEqual(await readdir(testDirectory), []);
});

test("removes stale crash artifacts but keeps a group protected by a fresh lock", async () => {
  const staleTime = new Date(Date.now() - SHARED_FILE_TTL_MS - 1_000);
  const staleSlug = "stale123";
  for (const extension of [".lock", ".bin.part", ".json.part", ".bin", ".json"]) {
    const artifact = path.join(testDirectory, `${staleSlug}${extension}`);
    await writeFile(artifact, extension === ".json" ? "not valid metadata" : "partial");
    await utimes(artifact, staleTime, staleTime);
  }
  const activeSlug = "active123";
  await writeFile(path.join(testDirectory, `${activeSlug}.lock`), "active");
  await writeFile(path.join(testDirectory, `${activeSlug}.bin.part`), "partial");
  await utimes(path.join(testDirectory, `${activeSlug}.bin.part`), staleTime, staleTime);

  await deleteExpiredSharedFiles();

  const files = await readdir(testDirectory);
  assert.equal(files.some((file) => file.startsWith(staleSlug)), false);
  assert.equal(files.includes(`${activeSlug}.lock`), true);
  assert.equal(files.includes(`${activeSlug}.bin.part`), true);
});
