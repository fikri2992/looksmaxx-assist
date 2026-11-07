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

test('the committed bundle is scrubbed and labelled demo data', async () => {
  const bundle = JSON.parse(await readFile(`${demoDir}/db.json`, 'utf8'));
  assert.equal(bundle.settings.vaultId, null);
  assert.ok(bundle.items.length > 0);
  assert.ok(bundle.items.every((i) => i.source === 'demo data'), 'every seeded item says it is demo data');
});
