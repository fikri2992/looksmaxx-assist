import assert from 'node:assert/strict';
import { test } from 'node:test';
import { maskBrands } from '../lib/mask.mjs';
import { emptyDb } from '../lib/store.mjs';

const db = emptyDb();
db.decisions.push({ id: 'd1', need: { type: 'sunscreen' }, product: { title: 'Acme Glow SPF 50 "Ultra"', brand: 'Acme', store: 'shop.example', image: 'https://cdn.example/p.jpg' }, alternatives: [{ title: 'Other Thing 2' }] });
db.watchJobs.push({ title: 'Acme Glow SPF 50 "Ultra"' });
const body = { decisions: db.decisions, log: [{ text: 'Paid $5 for Acme Glow SPF 50 "Ultra" at shop.example. Acme is great.' }], items: [{ name: 'My own serum' }] };

test('video mode hides product names, brands, stores and package photos', async () => {
  process.env.MASK_BRANDS = '1';
  const m = await maskBrands(body, db);
  delete process.env.MASK_BRANDS;
  const text = JSON.stringify(m);
  for (const leak of ['Acme', 'shop.example', 'cdn.example', 'Other Thing']) assert.ok(!text.includes(leak), `leaked ${leak}`);
  assert.equal(m.decisions[0].product.title, 'Sunscreen listing');
  assert.equal(m.decisions[0].product.store, 'online store');
  assert.equal(m.decisions[0].product.image, null);
  assert.equal(m.items[0].name, 'My own serum', 'the person’s own words stay');
  assert.equal(body.decisions[0].product.title, 'Acme Glow SPF 50 "Ultra"', 'the real data is untouched');
});

test('without video mode nothing changes', async () => {
  assert.equal(await maskBrands(body, db), body);
});
