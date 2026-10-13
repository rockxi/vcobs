import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { ChatService, CodexRpc, createChatServer, proxyEnvironment, codexArgs, MAX_CHAT_SNAPSHOT_BYTES, WORKSPACE_DIR } from '../server.mjs';
const env = { PATH: process.env.PATH, VCOBS_CHAT_HTTPS_PROXY: 'http://proxy.internal:3091', VCOBS_CHAT_SERVICE_SECRET: 's'.repeat(40) };
const temp = () => mkdtempSync(join(tmpdir(), 'vcobs-chat-test-'));
class FakeRpc extends EventEmitter {
  calls = []; account = { type: 'chatgpt', planType: 'plus' }; count = 0;
  async start() { this.started = true; }
  async request(method, params = {}) {
    this.calls.push({ method, params });
    if (this.failure === method) throw new Error('SECRET sk-test proxy-password');
    if (method === 'account/read') return { account: this.account };
    if (method === 'account/login/start') return { verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'ABCD', loginId: 'login1' };
    if (method === 'account/logout') this.account = null;
    if (method === 'model/list') return { data: [{ model: 'test-model', displayName: 'Test', isDefault: true }], nextCursor: null };
    if (method === 'thread/start') return { thread: { id: `thread${++this.count}` } };
    if (method === 'turn/start') return { turn: { id: 'turn1' } };
    return {};
  }
  close() { this.emit('closed'); }
}
function setup(extra = {}) { const rpc = new FakeRpc(); return { rpc, service: new ChatService({ env, dataDir: temp(), rpc, ...extra }) }; }
test('oversized Unicode answers remain readable and explicitly stop at the response budget', async () => {
  const { service, rpc } = setup(); const id = service.create().chat.id;
  await service.send(id, 'hello', 'test-model'); const chat = service.get(id);
  rpc.emit('notification', 'item/agentMessage/delta', { threadId: chat.threadId, turnId: chat.turnId, itemId: 'answer', delta: '🙂'.repeat(100_000) });
  const snapshot = service.snapshot(id);
  assert.equal(snapshot.status, 'error'); assert.match(snapshot.error, /новый чат/);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < MAX_CHAT_SNAPSHOT_BYTES);
  assert.ok(!snapshot.messages.at(-1).text.endsWith('\uFFFD'));
  assert.ok(rpc.calls.some(call => call.method === 'turn/interrupt'));
  rpc.emit('notification', 'item/completed', { threadId: chat.threadId, item: { id: 'answer', type: 'agentMessage', text: '🙂'.repeat(100_000) } });
  assert.deepEqual(service.snapshot(id), snapshot);
  service.close();
});
test('aggregate escaped JSON history stays below polling cap and rejects prompts without losing history', async () => {
  const { service, rpc } = setup(); const id = service.create().chat.id;
  let rejected = false;
  for (let index = 0; index < 20; index++) {
    try { await service.send(id, 'question', 'test-model'); }
    catch (error) { assert.equal(error.status, 409); assert.match(error.message, /новый чат/); rejected = true; break; }
    const chat = service.get(id);
    rpc.emit('notification', 'item/completed', { threadId: chat.threadId, turnId: chat.turnId, item: { id: `answer${index}`, type: 'agentMessage', text: '\u0000'.repeat(250_000) } });
    rpc.emit('notification', 'turn/completed', { threadId: chat.threadId, turn: { id: chat.turnId, status: 'completed' } });
    assert.ok(Buffer.byteLength(JSON.stringify(service.snapshot(id))) < MAX_CHAT_SNAPSHOT_BYTES);
  }
  assert.ok(rejected);
  const before = JSON.stringify(service.snapshot(id));
  await assert.rejects(service.send(id, 'another question', 'test-model'), /новый чат/);
  assert.equal(JSON.stringify(service.snapshot(id)), before);
  service.close();
});
test('proxy is mandatory, validated, and credentials/API keys are not inherited', () => {
  assert.throws(() => proxyEnvironment({}, temp()), /required Asus/);
  for (const proxy of ['socks5://localhost:1', 'file:///tmp/a', 'http://localhost:1/path', 'http://localhost:1/?x=1']) assert.throws(() => proxyEnvironment({ VCOBS_CHAT_HTTPS_PROXY: proxy }, temp()));
  const child = proxyEnvironment({ ...env, OPENAI_API_KEY: 'secret', NO_PROXY: '*', CODEX_HOME: '/user' }, '/isolated');
  assert.equal(child.HTTPS_PROXY, env.VCOBS_CHAT_HTTPS_PROXY + '/'); assert.equal(child.NO_PROXY, ''); assert.equal(child.OPENAI_API_KEY, undefined); assert.equal(child.CODEX_HOME, '/isolated/codex');
  assert.ok(codexArgs().includes('features.responses_websockets=false'));
  for (const setting of ['sandbox_mode="danger-full-access"', 'web_search="live"', 'features.shell_tool=true', 'features.unified_exec=true', 'shell_environment_policy.inherit="all"', 'approval_policy="never"']) assert.ok(codexArgs().includes(setting));
  for (const feature of ['apps', 'enable_mcp_apps', 'multi_agent', 'plugins', 'request_permissions_tool']) assert.ok(codexArgs().includes(`features.${feature}=false`));
});
test('status is fail closed without proxy and never starts app-server', async () => {
  const { service, rpc } = setup({ env: {} }); const status = await service.status(); assert.equal(status.configured, false); assert.equal(status.ready, false); assert.equal(rpc.started, undefined); service.close();
});
test('API key account rejected and public status excludes email and auth data', async () => {
  const { service, rpc } = setup(); rpc.account = { type: 'apiKey', email: 'private@example.com', accessToken: 'SECRET' };
  const status = await service.status(); assert.equal(status.ready, false); assert.equal(status.account, null); assert.ok(!JSON.stringify(status).includes('SECRET')); await assert.rejects(service.models()); service.close();
});
test('ChatGPT device login, pending reuse, completion and logout', async () => {
  const { service, rpc } = setup(); rpc.account = null;
  const status = await service.startLogin(); assert.equal(status.login.userCode, 'ABCD'); assert.equal(status.login.status, 'pending');
  await service.startLogin(); assert.equal(rpc.calls.filter(c => c.method === 'account/login/start').length, 1);
  rpc.account = { type: 'chatgpt', planType: 'pro', email: 'private@example.com' };
  rpc.emit('notification', 'account/login/completed', { loginId: 'login1', success: true });
  assert.equal((await service.status()).ready, true); assert.equal(service.account.email, undefined);
  await service.logout(); assert.equal((await service.status()).ready, false); service.close();
});
test('model list uses server catalog and account reads are cached for polling', async () => {
  const { service, rpc } = setup(); for (let i = 0; i < 10; i++) await service.status();
  assert.equal(rpc.calls.filter(c => c.method === 'account/read').length, 1);
  assert.deepEqual((await service.models()).models[0], { id: 'test-model', name: 'Test', description: '', default: true }); service.close();
});
test('native tools use fixed workspace and owner-selected full access on new, resumed and subsequent turns without losing history', async () => {
  const { service, rpc } = setup(); const id = service.create().chat.id;
  await service.send(id, 'Привет', 'test-model');
  const start = rpc.calls.find(c => c.method === 'thread/start').params;
  assert.equal(start.cwd, WORKSPACE_DIR); assert.equal(start.sandbox, 'danger-full-access');
  assert.equal(start.approvalPolicy, 'never'); assert.equal(start.config.web_search, 'live');
  assert.equal(start.environments, undefined); assert.deepEqual(start.dynamicTools, []);
  assert.match(start.developerInstructions, /native Codex terminal/);
  const turn = rpc.calls.find(c => c.method === 'turn/start').params;
  assert.equal(turn.cwd, WORKSPACE_DIR); assert.equal(turn.environments, undefined);
  assert.deepEqual(turn.sandboxPolicy, { type: 'dangerFullAccess' });
  assert.equal(turn.approvalPolicy, 'never');
  rpc.emit('notification', 'item/agentMessage/delta', { threadId: 'thread1', turnId: 'turn-wrong', itemId: 'a', delta: 'WRONG' });
  rpc.emit('notification', 'item/agentMessage/delta', { threadId: 'thread1', turnId: 'turn1', itemId: 'a', delta: 'Ответ' });
  rpc.emit('notification', 'turn/completed', { threadId: 'thread1', turn: { id: 'turn1', status: 'completed' } });
  assert.equal(service.snapshot(id).messages[1].text, 'Ответ'); assert.equal(service.snapshot(id).status, 'idle');
  const dir = service.dataDir; service.close();
  const next = setup({ dataDir: dir }); assert.equal(next.service.snapshot(id).messages[1].text, 'Ответ');
  await next.service.send(id, 'Ещё', 'test-model'); assert.ok(next.rpc.calls.some(c => c.method === 'thread/resume'));
  const resume = next.rpc.calls.find(c => c.method === 'thread/resume').params;
  assert.equal(resume.cwd, WORKSPACE_DIR); assert.equal(resume.sandbox, 'danger-full-access');
  assert.equal(resume.config.web_search, 'live'); assert.equal(resume.approvalPolicy, 'never');
  next.rpc.emit('notification', 'turn/completed', { threadId: 'thread1', turn: { id: 'stale-turn', status: 'completed' } });
  assert.equal(next.service.snapshot(id).status, 'running');
  await next.service.stop(id); assert.equal(next.service.snapshot(id).status, 'idle');
  await next.service.remove(id); assert.equal(next.service.list().chats.length, 0); next.service.close();
});
test('concurrent sends reject, errors sanitized, invalid model never starts turn', async () => {
  const { service, rpc } = setup(); const id = service.create().chat.id;
  const first = service.send(id, 'one', 'test-model'); await assert.rejects(service.send(id, 'two', 'test-model'), /already running/); await first;
  await assert.rejects(service.remove(id), /Stop/); await service.stop(id);
  await assert.rejects(service.send(id, 'one', 'not-catalog'), /available model/);
  rpc.failure = 'turn/start'; await assert.rejects(service.send(id, 'one', 'test-model'));
  // Non-HttpError never reaches snapshots or persistence.
  assert.ok(!JSON.stringify(service.snapshot(id)).includes('SECRET')); assert.ok(!readFileSync(service.file, 'utf8').includes('SECRET')); service.close();
});
test('restart marks running conversations interrupted', async () => {
  const { service } = setup(); const id = service.create().chat.id; await service.send(id, 'Hello', 'test-model'); service.save();
  const next = setup({ dataDir: service.dataDir }); assert.equal(next.service.snapshot(id).status, 'error'); assert.match(next.service.snapshot(id).error, /restart/); service.close(); next.service.close();
});
test('delayed interrupt acknowledgement cannot clear a newer active turn', async () => {
  const { service, rpc } = setup(); const id = service.create().chat.id;
  const request = rpc.request.bind(rpc); let acknowledgeInterrupt;
  rpc.request = async (method, params = {}) => {
    if (method === 'turn/interrupt') return new Promise(resolve => { acknowledgeInterrupt = resolve; });
    return request(method, params);
  };
  await service.send(id, 'First', 'test-model');
  const stopping = service.stop(id);
  rpc.emit('notification', 'turn/completed', { threadId: 'thread1', turn: { id: 'turn1', status: 'interrupted' } });
  rpc.request = async (method, params = {}) => method === 'turn/start' ? { turn: { id: 'turn2' } } : request(method, params);
  await service.send(id, 'Second', 'test-model');
  acknowledgeInterrupt({}); await stopping;
  assert.equal(service.snapshot(id).status, 'running'); assert.equal(service.get(id).turnId, 'turn2');
  rpc.emit('notification', 'item/agentMessage/delta', { threadId: 'thread1', turnId: 'turn2', itemId: 'answer2', delta: 'Second answer' });
  assert.equal(service.snapshot(id).messages.at(-1).text, 'Second answer');
  service.close();
});
test('delayed turn-start acknowledgement cannot overwrite the next turn ID', async () => {
  const { service, rpc } = setup(); const id = service.create().chat.id;
  const request = rpc.request.bind(rpc); let acknowledgeFirst; let startedFirst;
  const firstStarted = new Promise(resolve => { startedFirst = resolve; }); let turnNumber = 0;
  rpc.request = async (method, params = {}) => {
    if (method !== 'turn/start') return request(method, params);
    turnNumber++;
    if (turnNumber === 1) return new Promise(resolve => { acknowledgeFirst = resolve; startedFirst(); });
    return { turn: { id: 'turn2' } };
  };
  const firstSend = service.send(id, 'First', 'test-model'); await firstStarted;
  rpc.emit('notification', 'turn/started', { threadId: 'thread1', turn: { id: 'turn1' } });
  rpc.emit('notification', 'turn/completed', { threadId: 'thread1', turn: { id: 'turn1', status: 'completed' } });
  await service.send(id, 'Second', 'test-model');
  acknowledgeFirst({ turn: { id: 'turn1' } }); await firstSend;
  assert.equal(service.get(id).turnId, 'turn2'); assert.equal(service.snapshot(id).status, 'running');
  rpc.emit('notification', 'item/agentMessage/delta', { threadId: 'thread1', turnId: 'turn2', itemId: 'answer2', delta: 'Kept' });
  assert.equal(service.snapshot(id).messages.at(-1).text, 'Kept'); service.close();
});
test('HTTP auth, origin, method/body allowlists, size bounds, no arbitrary RPC', async () => {
  const { service } = setup(); const server = createChatServer({ env, service }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(base + path, { ...options, headers: { authorization: `Bearer ${env.VCOBS_CHAT_SERVICE_SECRET}`, 'content-type': 'application/json', ...options.headers } });
  assert.equal((await fetch(base + '/status')).status, 401);
  assert.equal((await request('/status', { headers: { origin: 'https://vcobs.rockxi.ru' } })).status, 403);
  assert.equal((await request('/command/exec', { method: 'POST', body: '{}' })).status, 404);
  assert.equal((await request('/chats', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await request('/login', { method: 'POST', body: '{"apiKey":"SECRET"}' })).status, 400);
  assert.equal((await request('/chats', { method: 'POST', body: JSON.stringify({ title: 'x'.repeat(140001) }) })).status, 413);
  const create = await request('/chats', { method: 'POST', body: '{}' }); const { chat } = await create.json();
  assert.equal((await request(`/chats/${chat.id}/messages`, { method: 'POST', body: JSON.stringify({ text: 'Hello', model: 'test-model', cwd: '/' }) })).status, 400);
  assert.equal((await request(`/chats/${chat.id}/messages`, { method: 'POST', body: JSON.stringify({ text: 'Hello', model: 'test-model' }) })).status, 200);
  assert.equal((await request(`/chats/${chat.id}`)).status, 200);
  assert.equal((await request('/status?token=x')).status, 400);
  await new Promise(resolve => server.close(resolve));
});
test('JSONL RPC handshake, server requests rejected and timeout/exit reject pending', async () => {
  let child;
  const spawnFn = (_cmd, args, options) => {
    assert.ok(args.includes('stdio://')); assert.equal(options.env.OPENAI_API_KEY, undefined);
    assert.equal(options.cwd, WORKSPACE_DIR);
    child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
    child.stdin.on('data', data => {
      const value = JSON.parse(String(data));
      if (value.method === 'initialize') child.stdout.write(JSON.stringify({ id: value.id, result: {} }) + '\n');
    }); return child;
  };
  const rpc = new CodexRpc({ env, dataDir: temp(), spawnFn, timeout: 30 }); await rpc.start();
  const denied = once(rpc, 'forbidden'); child.stdout.write('{"id":999,"method":"item/commandExecution/requestApproval","params":{}}\n'); await denied;
  const pending = rpc.request('will-timeout'); await assert.rejects(pending, /unavailable/); assert.equal(rpc.pending.size, 0); rpc.close();
});
