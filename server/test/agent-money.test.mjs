import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moneySummary, prepareRefund, watchPrice } from '../lib/agent.mjs';
import { emptyDb, load, reset } from '../lib/store.mjs';

const thisMonth = new Date().toISOString().slice(0, 10);
async function fixture() {
  await load();
  const db = reset(emptyDb());
  db.decisions.push(
    { id: 'd_cap', at: thisMonth, verdict: 'buy', product: { id: 'p1', title: 'Sunscreen', price: 14 }, facts: { 'price.low': 12 },
      paypal: { authId: 'A1', authorized: 14, captureId: 'C1', capturedAt: `${thisMonth}T01:00:00Z`, amount: 13.5, status: 'captured', payee: 'store' } },
    { id: 'd_void', at: thisMonth, verdict: 'buy', product: { id: 'p2', title: 'Toner', price: 9 }, paypal: { authId: 'A2', authorized: 9, status: 'voided' } },
    { id: 'd_wait', at: thisMonth, verdict: 'wait', product: { id: 'p3', title: 'Concealer', price: 11 }, facts: { 'price.low': 8.5 } },
  );
  return db;
}

test('money summary counts only captured purchases this month', async () => {
  const s = moneySummary(await fixture());
  assert.equal(s.spent, 13.5);
  assert.equal(s.left, 120 - 13.5);
  assert.deepEqual(s.purchases.map((p) => p.status), ['captured', 'voided']);
});

test('watch defaults to the 30-day low and does not duplicate', async () => {
  const db = await fixture();
  assert.equal(watchPrice(db, 'd_wait').ok, true);
  assert.equal(db.watchJobs[0].trigger.price, 8.5);
  assert.match(watchPrice(db, 'd_wait').summary, /Already watching/);
  assert.equal(db.watchJobs.length, 1);
  assert.equal(watchPrice(db, 'nope').ok, false);
});

test('a watch can only replace a purchase that did not happen, at a lower price', async () => {
  const db = await fixture();
  assert.equal(watchPrice(db, 'd_cap').ok, false, 'not a decision that was bought');
  db.decisions.push({ id: 'd_buy', verdict: 'buy', product: { id: 'p9', title: 'Mist', price: 10 }, facts: {} });
  assert.equal(watchPrice(db, 'd_buy', 999).ok, false, 'not a buy verdict, so the model cannot schedule a purchase');
  assert.equal(watchPrice(db, 'd_wait', 11).ok, false, "not at or above today's price");
  assert.equal(db.watchJobs.length, 0);
});

test('a product already at its low is watched for 10% under today', async () => {
  const db = await fixture();
  db.decisions.push({ id: 'd_low', verdict: 'ask', product: { id: 'p4', title: 'Powder', price: 20 }, facts: { 'price.low': 20 } });
  watchPrice(db, 'd_low');
  assert.equal(db.watchJobs.at(-1).trigger.price, 18);
});

test('refund is only prepared, never executed, and only for captured money', async () => {
  const db = await fixture();
  const r = prepareRefund(db, 'd_cap', 'Too greasy');
  assert.equal(r.ok, true);
  assert.equal(r.attachment.kind, 'refund');
  assert.equal(db.decisions[0].paypal.refundId, undefined, 'no money moved');
  assert.equal(prepareRefund(db, 'd_void', 'x').ok, false);
  db.decisions[0].paypal.refundId = 'R1';
  assert.equal(prepareRefund(db, 'd_cap', 'x').ok, false);
});
