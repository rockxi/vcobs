import assert from "node:assert/strict";
import { mkdtemp, chmod, lstat, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { provision, updateDevicesEnv, validateOptions } from "../scripts/provision-remote-device.mjs";

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vcobs-provision-"));
  await chmod(directory, 0o700);
  const envPath = path.join(directory, ".env.local");
  await writeFile(envPath, "KEEP=this line\n", { mode: 0o600 });
  return { directory, envPath, configPath: path.join(directory, "mac", "remote-agent.json") };
}
function options(paths: Awaited<ReturnType<typeof fixture>>) { return { envPath: paths.envPath, deviceId: "mac_office", name: "Office Mac", agentConfigPath: paths.configPath, remoteUrl: "wss://vcobs.rockxi.ru/remote/agent" }; }

test("provisions a device without changing unrelated env lines or exposing its token", async () => {
  const paths = await fixture();
  const result = await provision(options(paths));
  assert.deepEqual(result, { deviceId: "mac_office", created: true });
  const env = await readFile(paths.envPath, "utf8");
  assert.match(env, /^KEEP=this line$/m);
  const config = JSON.parse(await readFile(paths.configPath, "utf8"));
  assert.equal(config.remoteUrl, "wss://vcobs.rockxi.ru/remote/agent");
  assert.equal(config.deviceId, "mac_office");
  assert.match(config.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal((await lstat(paths.envPath)).mode & 0o777, 0o600);
  assert.equal((await lstat(paths.configPath)).mode & 0o777, 0o600);
});

test("same device id retains its secret and updates its display name", () => {
  const original = 'KEEP=yes\nVCOBS_REMOTE_DEVICES_JSON="{\\"mac_1\\":{\\"name\\":\\"Old\\",\\"token\\":\\"1234567890123456\\"}}"\n';
  const updated = updateDevicesEnv(original, "mac_1", "New", "different-token");
  assert.equal(updated.created, false);
  assert.equal(updated.token, "1234567890123456");
  assert.match(updated.envText, /KEEP=yes/);
  assert.match(updated.envText, /New/);
});

test("refuses a committed-looking placeholder instead of treating it as an idempotent secret", () => {
  const placeholder = 'VCOBS_REMOTE_DEVICES_JSON="{\\"mac-office\\":{\\"name\\":\\"Office Mac\\",\\"token\\":\\"replace-with-a-32-byte-random-token\\"}}"\n';
  assert.throws(() => updateDevicesEnv(placeholder, "mac-office", "Office Mac", "new-token"), /placeholder token/);
});

test("rejects unsafe permissions, symlinks, and invalid input", async () => {
  const paths = await fixture();
  await chmod(paths.envPath, 0o644);
  await assert.rejects(provision(options(paths)), /mode 0600/);
  await chmod(paths.envPath, 0o600);
  const linked = path.join(paths.directory, "linked.json");
  await writeFile(path.join(paths.directory, "target.json"), "{}", { mode: 0o600 });
  await symlink(path.join(paths.directory, "target.json"), linked);
  await assert.rejects(provision({ ...options(paths), agentConfigPath: linked }), /symlink/);
  assert.throws(() => validateOptions({ ...options(paths), remoteUrl: "ws://vcobs.rockxi.ru/remote/agent" }), /wss/);
});
