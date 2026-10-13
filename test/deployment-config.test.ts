import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("installs system trust roots for the native Codex HTTPS authentication client", async () => {
  const dockerfile = await readFile(path.join(root, "chat-service/Dockerfile"), "utf8");
  assert.match(dockerfile, /apt-get install -y --no-install-recommends ca-certificates/);
  assert.ok(dockerfile.indexOf("ca-certificates") < dockerfile.indexOf("USER node"));
  assert.doesNotMatch(dockerfile, /NODE_TLS_REJECT_UNAUTHORIZED|danger_accept_invalid_certs|--insecure/);
});

test("keeps native Codex workspace persistent without host mounts, elevated privileges or custom executors", async () => {
  const compose = await readFile(path.join(root, "docker-compose.yaml"), "utf8");
  const dockerfile = await readFile(path.join(root, "chat-service/Dockerfile"), "utf8");
  const chat = compose.slice(compose.indexOf("  chat-service:"), compose.indexOf("  # The Codex container"));
  assert.match(chat, /- vcobs-workspace:\/workspace/);
  assert.match(compose, /^  vcobs-workspace:$/m);
  assert.match(dockerfile, /mkdir -p \/data\/codex \/workspace/);
  assert.match(dockerfile, /chown -R node:node \/data \/workspace/);
  assert.match(dockerfile, /ca-certificates bash curl git python3/);
  assert.match(dockerfile, /USER node/);
  assert.match(chat, /cap_drop:\n\s+- ALL/);
  assert.match(chat, /no-new-privileges:true/);
  assert.match(chat, /mem_limit: 1g/);
  assert.match(chat, /cpus: 2/);
  assert.match(chat, /pids_limit: 256/);
  assert.doesNotMatch(chat, /privileged:|SYS_ADMIN|unconfined|docker\.sock|\.\/.*:\/workspace|executor/);
});

test("persists temporary shared files in the application data directory", async () => {
  const compose = await readFile(path.join(root, "docker-compose.yaml"), "utf8");
  assert.match(compose, /^\s*- vcobs-files:\/app\/data\/files$/m);
  assert.match(compose, /^volumes:\n\s+vcobs-files:/m);
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
