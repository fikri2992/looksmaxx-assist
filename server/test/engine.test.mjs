import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avoidHit, compareCheckins, runOut } from '../lib/engine.mjs';
import { summarize } from '../lib/prices.mjs';
import { emptyDb, reset, load } from '../lib/store.mjs';

const reactions = [{ item: 'Rose toner', note: 'stung', avoid: ['fragrance', 'vitamin c'] }];

test('avoid list catches the ingredient but not a "free" label', () => {
  assert.equal(avoidHit('Brightening Vitamin C Serum', reactions)?.word, 'vitamin c');
  assert.equal(avoidHit('Hand Cream Fragrance-Free', reactions), null);
  assert.equal(avoidHit('Fragrance free lotion', reactions), null);
  assert.equal(avoidHit('Rose fragrance mist', reactions)?.word, 'fragrance');
});

test('run-out is an estimate for consumables and nothing for clothes', () => {
  assert.equal(runOut({ category: 'wardrobe', type: 'top' }).daysLeft, null);
  assert.equal(runOut({ category: 'skincare', type: 'moisturizer', status: 'low' }).daysLeft, 7);
  assert.equal(runOut({ category: 'skincare', type: 'moisturizer', status: 'finished' }).daysLeft, 0);
  assert.equal(runOut({ category: 'skincare', type: 'sunscreen', opened: '2026-10-01' }, '2026-11-07').daysLeft, 45 - 37);
  assert.equal(runOut({ category: 'skincare', type: 'sunscreen' }).daysLeft, null, 'unknown open date stays unknown');
});

test('check-in changes are computed in code, only for traits in both readings', () => {
  const before = { skin: [{ trait: 'redness', level: 'none' }, { trait: 'shine', level: 'mild' }] };
  const after = { skin: [{ trait: 'redness', level: 'noticeable' }, { trait: 'shine', level: 'mild' }, { trait: 'dryness', level: 'mild' }] };
  assert.deepEqual(compareCheckins(before, after), ['redness: none → noticeable']);
  assert.deepEqual(compareCheckins(null, after), []);
});

test('price summary reads low, high and days', () => {
  assert.deepEqual(summarize([{ at: '2026-10-01', price: 48 }, { at: '2026-10-10', price: 70 }, { at: '2026-11-01', price: 48 }]), { days: 3, low: 48, high: 70, first: '2026-10-01', last: '2026-11-01' });
  assert.deepEqual(summarize([]), { days: 0, low: null, high: null });
});

test('reset keeps the same database object, so every module sees the reset', async () => {
  process.env.DB_FILE = 'C:/nonexistent-shelfie-test/db.json';
  const db = await load();
  db.items.push({ id: 'x' });
  const same = reset(emptyDb());
  assert.equal(same, db);
  assert.equal(db.items.length, 0);
});

test('after-opening period: mascara expires fast, lipstick slow, clothes never', async () => {
  const { afterOpening } = await import('../lib/engine.mjs');
  const m = afterOpening({ category: 'makeup', type: 'mascara', opened: '2026-07-01' }, '2026-11-07');
  assert.equal(m.past, true);
  assert.equal(m.months, 3);
  assert.equal(afterOpening({ category: 'makeup', type: 'lipstick', opened: '2026-10-08' }, '2026-11-07').past, false);
  assert.equal(afterOpening({ category: 'makeup', type: 'mascara', opened: '2026-07-01', paoMonths: 6 }, '2026-11-07').past, false, 'the label wins');
  assert.equal(afterOpening({ category: 'wardrobe', type: 'top', opened: '2026-01-01' }), null);
  assert.equal(afterOpening({ category: 'makeup', type: 'mascara' }), null, 'unknown open date stays unknown');
});

test('a second open decision for the same kind of thing this week counts as already listed', async () => {
  const { alreadyListed } = await import('../lib/engine.mjs');
  const db = { decisions: [{ id: 'd1', at: new Date().toISOString(), verdict: 'buy', product: { id: 'p' }, need: { type: 'mascara', category: 'makeup' } }] };
  const need = { type: 'mascara', category: 'makeup' };
  assert.equal(alreadyListed(db, need), true);
  assert.equal(alreadyListed(db, need, ['d1']), false, 'a decision never blocks itself or the one it follows up');
  assert.equal(alreadyListed(db, { type: 'lipstick', category: 'makeup' }), false);
  db.decisions[0].paypal = { status: 'voided' };
  assert.equal(alreadyListed(db, need), false, 'a voided purchase is not on the list');
});
