import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runWatches } from '../lib/engine.mjs';
import { historyFor, summarize } from '../lib/prices.mjs';
import { emptyDb, load, reset } from '../lib/store.mjs';

// A product from our own price log, so no network is needed.
const PRODUCT = { id: 'hoK3cs0', title: 'Daily Sheer Broad-Spectrum Sunscreen SPF 50', store: 'demo store', price: 0, was: null };

async function fixture() {
  await load();
  const db = reset(emptyDb());
  const low = summarize((await historyFor(PRODUCT.id)).rows).low;
  const product = { ...PRODUCT, price: +(low * 1.2).toFixed(2) };
  db.decisions.push({ id: 'd_wait', at: new Date().toISOString(), verdict: 'wait', need: { need: 'Restock sunscreen', category: 'skincare', type: 'sunscreen' }, product, reasons: [] });
  db.watchJobs.push({ id: 'job_1', createdBy: 'agent', decisionId: 'd_wait', productId: PRODUCT.id, title: PRODUCT.title, trigger: { op: 'lte', price: low }, firedAt: null });
  return { db, low };
}

test('a watch closes instead of buying again when the product was already bought', async () => {
  const { db, low } = await fixture();
  db.decisions.push({ id: 'd_paid', product: { id: PRODUCT.id }, paypal: { status: 'captured', captureId: 'C1' } });
  db.settings.vaultId = 'V1';
  assert.equal((await runWatches(db, { priceOf: async () => ({ price: low, store: 'x', live: true }), weather: null })).length, 0);
  assert.equal(db.watchJobs[0].closed, 'already bought');
});

test('a simulated price must be positive and at most the target, and is never paid for', async () => {
  const { db, low } = await fixture();
  await assert.rejects(runWatches(db, { simulate: { job_1: 'x' }, weather: null }));
  await assert.rejects(runWatches(db, { simulate: { job_1: -1 }, weather: null }));
  await assert.rejects(runWatches(db, { simulate: { job_1: low + 1 }, weather: null }));
  db.settings.vaultId = 'V1'; // even with PayPal approved, a simulated buy moves no money
  await runWatches(db, { simulate: { job_1: low }, weather: null });
  assert.equal(db.decisions[0].paypal, undefined);
});

test('a watch above its target does not fire', async () => {
  const { db, low } = await fixture();
  const fired = await runWatches(db, { priceOf: async () => low + 5, weather: null });
  assert.equal(fired.length, 0);
  assert.equal(db.watchJobs[0].firedAt, null);
  assert.equal(db.watchJobs[0].lastPrice, low + 5);
});

test('a fired watch decides again with the tested rules, labelled, and moves no money without approval', async () => {
  const { db, low } = await fixture();
  const fired = await runWatches(db, { simulate: { job_1: low }, weather: null });
  assert.equal(fired.length, 1);
  const d = db.decisions[0];
  assert.equal(d.followsUp, 'd_wait');
  assert.equal(d.trigger.simulated, true);
  assert.equal(d.product.price, low);
  assert.ok(['buy', 'ask', 'wait', 'veto'].includes(d.verdict));
  assert.equal(d.paypal, undefined, 'no PayPal call without an approved payment method');
  assert.ok(db.watchJobs[0].firedAt);
  assert.equal(db.watchJobs[0].followUpId, d.id);
  await assert.rejects(runWatches(db, { simulate: { job_1: low }, weather: null }), /open watch/, 'a fired watch stays fired');
  assert.equal((await runWatches(db, { priceOf: async () => low, weather: null })).length, 0);
});
