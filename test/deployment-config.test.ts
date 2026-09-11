import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("persists temporary shared files in the application data directory", async () => {
  const compose = await readFile(path.join(root, "docker-compose.yaml"), "utf8");
  assert.match(compose, /^\s*- vcobs-files:\/app\/data\/files$/m);
  assert.match(compose, /^volumes:\n\s+vcobs-files:$/m);
  assert.doesNotMatch(compose, /\.\/data\/files/);
});

test("runs shared-file expiry cleanup beside paste cleanup", async () => {
  const instrumentation = await readFile(path.join(root, "instrumentation.ts"), "utf8");
  assert.match(instrumentation, /deleteExpiredPastes/);
  assert.match(instrumentation, /deleteExpiredSharedFiles/);
  assert.match(instrumentation, /Shared file cleanup failed/);
});

test("uses image-owned named-volume initialization without workflow ownership commands", async () => {
  const workflow = await readFile(path.join(root, ".github/workflows/deploy-asus.yml"), "utf8");
  const dockerfile = await readFile(path.join(root, "Dockerfile"), "utf8");
  assert.match(dockerfile, /mkdir -p \/app\/data\/files/);
  assert.match(dockerfile, /chown -R nextjs:nodejs \/app\/data\/files/);
  assert.doesNotMatch(workflow, /data\/files|chown -R 1001:1001/);
});

test("limits Node heap only while building the production image", async () => {
  const dockerfile = await readFile(path.join(root, "Dockerfile"), "utf8");
  const builderStage = dockerfile.slice(dockerfile.indexOf("FROM base AS builder"), dockerfile.indexOf("FROM base AS runner"));
  const runnerStage = dockerfile.slice(dockerfile.indexOf("FROM base AS runner"));
  assert.match(builderStage, /ENV NODE_OPTIONS=--max-old-space-size=1024/);
  assert.doesNotMatch(runnerStage, /NODE_OPTIONS/);
});
