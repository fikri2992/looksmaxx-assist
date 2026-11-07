// Starts the real server on a spare port with throwaway data folders and hits its routes. Only free routes:
// nothing here calls OpenAI, PayPal or Channel3.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 18000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
let server, dir;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'shelfie-http-'));
  server = spawn(process.execPath, ['server/index.mjs', String(port)], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DB_FILE: path.join(dir, 'db.json'), PHOTO_DIR: path.join(dir, 'photos'), PUBLIC_DEMO: '1', LIVE_ENABLED: '0', WATCH_EVERY_HOURS: '0', MASK_BRANDS: '' },
  });
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('server did not start')), 15000);
    server.stdout.on('data', (b) => { if (String(b).includes('Shelfie server')) { clearTimeout(t); ok(); } });
    server.on('exit', (code) => fail(new Error(`server exited ${code}`)));
  });
});
after(async () => { server?.kill(); await rm(dir, { recursive: true, force: true }); });

const get = (p) => fetch(base + p);
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });

test('a fresh server starts from the demo bundle', async () => {
  const s = await (await get('/api/state')).json();
  assert.ok(s.items.length > 0);
  assert.ok(s.decisions.some((d) => d.verdict === 'veto'), 'the demo opens on a skip');
  assert.equal(s.settings.vaultId, undefined, 'never exposes a saved payment method');
});

test('pages are served and paths cannot escape the app folder', async () => {
  assert.equal((await get('/ledger')).status, 200);
  assert.equal((await get('/live')).status, 200);
  assert.ok([403, 404].includes((await get('/..%2f..%2fpackage.json')).status));
  assert.equal((await get('/%E0%A4%A')).status, 400, 'a malformed escape is refused, not a crash');
  assert.equal((await get('/api/health')).status, 200, 'and the server is still up');
});

test('a buy decision cannot become a watch', async () => {
  const s = await (await get('/api/state')).json();
  const buy = s.decisions.find((d) => d.verdict === 'buy');
  if (!buy) return;
  const r = await post('/api/watch', { id: buy.id });
  assert.equal(r.status, 400);
});

test('a bad simulated price is refused', async () => {
  const s = await (await get('/api/state')).json();
  const job = s.watchJobs.find((j) => !j.firedAt);
  if (!job) return;
  const r = await post('/api/watch/run', { simulate: { [job.id]: -5 } });
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /simulated price/);
});

test('live calls can be switched off', async () => {
  const r = await post('/api/live/session', { sdp: 'v=0\r\n' });
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /turned off/);
});

test('on a public demo, reset returns to the persona', async () => {
  await post('/api/items', { item: { name: 'Junk', category: 'other', type: 'x' } });
  const s = await (await post('/api/reset')).json();
  assert.ok(s.items.length > 0);
  assert.ok(!s.items.some((i) => i.name === 'Junk'));
});
