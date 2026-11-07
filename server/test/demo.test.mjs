import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { demoDir, scrub } from '../lib/demo.mjs';
import { emptyDb } from '../lib/store.mjs';

test('the demo bundle never carries a saved payment method or pending approval', async () => {
  const db = emptyDb();
  Object.assign(db.settings, { vaultId: 'V123', pendingOrder: { orderId: 'O1' }, pendingMandate: { setupTokenId: 'S1' } });
  const s = scrub(db).settings;
  assert.equal(s.vaultId, null);
  assert.equal(s.pendingOrder, null);
  assert.equal(s.pendingMandate, null);
  assert.equal(db.settings.vaultId, 'V123', 'the live database is untouched');
});

test('the demo bundle drops PayPal ids, payee emails and ids in log text', () => {
  const db = emptyDb();
  db.decisions.push({ id: 'd1', paypal: { authId: '7AB12345CD678901E', captureId: '9XY98765ZW432109K', payee: 'store@business.example.com', amount: 12, status: 'captured' } });
  db.log.push({ text: 'Final check passed. Paid $12 to the store. PayPal capture 9XY98765ZW432109K.' }, { text: 'Authorized $12 for MOISTURIZING lotion.' });
  db.chat.push({ role: 'assistant', text: 'Paid store@business.example.com' });
  const s = scrub(db);
  assert.deepEqual(s.decisions[0].paypal, { status: 'captured', amount: 12, demo: true });
  assert.ok(!JSON.stringify(s).includes('9XY98765ZW432109K'));
  assert.ok(!JSON.stringify(s).includes('business.example.com'));
  assert.match(s.log[1].text, /MOISTURIZING/, 'ordinary capitals stay');
});

test('the committed bundle is scrubbed and labelled demo data', async () => {
  const bundle = JSON.parse(await readFile(`${demoDir}/db.json`, 'utf8'));
  assert.equal(bundle.settings.vaultId, null);
  assert.ok(bundle.items.length > 0);
  assert.ok(bundle.items.every((i) => i.source === 'demo data'), 'every seeded item says it is demo data');
});
