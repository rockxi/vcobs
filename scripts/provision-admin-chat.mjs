import { randomBytes } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

// One-time configuration utility. Preserves the site's existing credentials;
// never prints either the existing configuration or the generated secret.
const file = resolve(process.argv[2] || '.env.local');
const stat = lstatSync(file);
if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected a regular env file');
const source = readFileSync(file, 'utf8');
const matches = source.match(/^VCOBS_CHAT_SERVICE_SECRET=.*$/gm) || [];
if (matches.length > 1) throw new Error('Duplicate chat service secret');
if (matches.length) {
  const value = matches[0].slice('VCOBS_CHAT_SERVICE_SECRET='.length).trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!/^[a-f0-9]{64,}$/i.test(value)) throw new Error('Existing chat secret needs manual validation; preserved');
  console.log('Existing chat service secret retained');
} else {
  const temporary = `${file}.chat-setup-${process.pid}`;
  const backup = `${file}.before-chat-${Date.now()}`;
  writeFileSync(backup, source, { mode: 0o600, flag: 'wx' });
  writeFileSync(temporary, `${source}${source.endsWith('\n') ? '' : '\n'}VCOBS_CHAT_SERVICE_SECRET=${randomBytes(32).toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(temporary, file);
  console.log('Chat service secret configured; previous env backed up');
}
