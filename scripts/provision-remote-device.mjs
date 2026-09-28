#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

const DEVICE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_MODE = 0o600;

function isPlaceholderToken(token) {
  return /(?:replace|placeholder|example|changeme|your[-_]?token|random[-_]?token)/i.test(token);
}

function fail(message) { throw new Error(message); }

export function validateOptions(options) {
  for (const key of ["envPath", "deviceId", "name", "agentConfigPath", "remoteUrl"]) {
    if (!options[key] || typeof options[key] !== "string") fail(`--${key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)} is required`);
  }
  if (!path.isAbsolute(options.envPath) || !path.isAbsolute(options.agentConfigPath)) fail("--env and --agent-config must be absolute paths");
  if (!DEVICE_ID.test(options.deviceId)) fail("--device-id must contain 1-64 letters, digits, _ or -");
  if (options.name.trim().length < 1 || options.name.length > 128 || /[\r\n\0]/.test(options.name)) fail("--name must contain 1-128 printable characters");
  let remoteUrl;
  try { remoteUrl = new URL(options.remoteUrl); } catch { fail("--remote-url must be a valid wss URL"); }
  if (remoteUrl.protocol !== "wss:" || remoteUrl.pathname !== "/remote/agent" || remoteUrl.search || remoteUrl.hash || remoteUrl.username || remoteUrl.password) fail("--remote-url must be a clean wss:// URL ending in /remote/agent");
  return { ...options, name: options.name.trim(), remoteUrl: remoteUrl.toString() };
}

async function assertSafeFile(filePath, { mustExist = false } = {}) {
  let stat;
  try { stat = await lstat(filePath); } catch (error) {
    if (error.code === "ENOENT" && !mustExist) return;
    if (error.code === "ENOENT") fail(`${filePath} does not exist`);
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${filePath} must be a regular file, not a symlink`);
  if ((stat.mode & 0o077) !== 0) fail(`${filePath} must have mode 0600`);
}

async function assertSafeDirectory(filePath) {
  const directory = path.dirname(filePath);
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${directory} must be a real directory, not a symlink`);
  if ((stat.mode & 0o022) !== 0) fail(`${directory} must not be writable by group or others`);
}

async function atomicWrite(filePath, content) {
  await assertSafeDirectory(filePath);
  await assertSafeFile(filePath);
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", SAFE_MODE);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    await chmod(temporary, SAFE_MODE);
    await assertSafeFile(filePath);
    await rename(temporary, filePath);
    await chmod(filePath, SAFE_MODE);
  } catch (error) {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function serializeEnvValue(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function updateDevicesEnv(envText, deviceId, name, token) {
  const lines = envText.split(/\r?\n/);
  const assignments = lines.filter(line => /^\s*(?:export\s+)?VCOBS_REMOTE_DEVICES_JSON\s*=/.test(line));
  if (assignments.length > 1) fail("VCOBS_REMOTE_DEVICES_JSON is defined more than once");
  let devices = {};
  if (assignments.length === 1) {
    const raw = assignments[0].replace(/^\s*(?:export\s+)?VCOBS_REMOTE_DEVICES_JSON\s*=\s*/, "").trim();
    const value = (raw.startsWith('"') && raw.endsWith('"')) ? JSON.parse(raw) : raw;
    try { devices = JSON.parse(value); } catch { fail("VCOBS_REMOTE_DEVICES_JSON must contain valid JSON"); }
    if (!devices || typeof devices !== "object" || Array.isArray(devices)) fail("VCOBS_REMOTE_DEVICES_JSON must be a JSON object");
  }
  const existing = devices[deviceId];
  if (existing !== undefined && (!existing || typeof existing !== "object" || typeof existing.token !== "string" || existing.token.length < 16)) fail(`existing device ${deviceId} has an invalid token`);
  if (existing && isPlaceholderToken(existing.token)) fail(`existing device ${deviceId} uses a placeholder token; remove it and provision again`);
  devices[deviceId] = { name, token: existing?.token || token };
  const assignment = `VCOBS_REMOTE_DEVICES_JSON=${serializeEnvValue(JSON.stringify(devices))}`;
  const index = lines.findIndex(line => /^\s*(?:export\s+)?VCOBS_REMOTE_DEVICES_JSON\s*=/.test(line));
  if (index >= 0) lines[index] = assignment;
  else {
    if (lines.length && lines.at(-1) !== "") lines.push("");
    lines.push(assignment);
  }
  return { envText: lines.join("\n"), token: devices[deviceId].token, created: !existing };
}

export async function provision(options) {
  const checked = validateOptions(options);
  await assertSafeFile(checked.envPath, { mustExist: true });
  const envText = await readFile(checked.envPath, "utf8");
  const generatedToken = randomBytes(32).toString("base64url");
  const update = updateDevicesEnv(envText, checked.deviceId, checked.name, generatedToken);
  await atomicWrite(checked.envPath, update.envText);
  const config = `${JSON.stringify({ remoteUrl: checked.remoteUrl, deviceId: checked.deviceId, token: update.token }, null, 2)}\n`;
  await mkdir(path.dirname(checked.agentConfigPath), { recursive: true, mode: 0o700 });
  await atomicWrite(checked.agentConfigPath, config);
  return { deviceId: checked.deviceId, created: update.created };
}

function parseArgs(argv) {
  const names = { "--env": "envPath", "--device-id": "deviceId", "--name": "name", "--agent-config": "agentConfigPath", "--remote-url": "remoteUrl" };
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = names[argv[index]], value = argv[index + 1];
    if (!key || value === undefined || options[key] !== undefined) fail("Usage: provision-remote-device.mjs --env ABS_PATH --device-id ID --name NAME --agent-config ABS_PATH --remote-url wss://vcobs.rockxi.ru/remote/agent");
    options[key] = value;
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  provision(parseArgs(process.argv.slice(2))).then(result => {
    console.log(`Provisioned remote device ${result.deviceId}${result.created ? "" : " (existing token retained)"}. Agent configuration written with mode 0600.`);
  }).catch(error => { console.error(`Provisioning failed: ${error.message}`); process.exitCode = 1; });
}
