import assert from 'node:assert/strict';
import { test } from 'node:test';
import { whatWorks } from '../lib/insights.mjs';

const day = (n) => new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);

test('a product used on rougher days shows up as seeming to hurt', () => {
  const db = { items: [{ id: 'r', name: 'Retinol', category: 'skincare' }], checkins: [], diary: [] };
  for (let i = 0; i < 8; i++) db.diary.push({ date: day(i), am: [], pm: i % 2 ? ['r'] : [], feel: i % 2 ? 'Tight' : 'Calm' });
  const r = whatWorks(db).results[0];
  assert.equal(r.verdict, 'seems to hurt');
  assert.equal(r.diff, 1);
});

test('too few days on either side says so instead of guessing', () => {
  const db = { items: [{ id: 'm', name: 'Moisturizer', category: 'skincare' }], checkins: [], diary: [] };
  for (let i = 0; i < 6; i++) db.diary.push({ date: day(i), am: ['m'], pm: [], feel: 'Calm' });
  assert.equal(whatWorks(db).results[0].verdict, 'not enough data');
});

test('check-in levels count alongside the diary feel', () => {
  const db = { items: [{ id: 's', name: 'Serum', category: 'skincare' }], diary: [], checkins: [] };
  for (let i = 0; i < 6; i++) {
    db.diary.push({ date: day(i), am: i < 3 ? ['s'] : [], pm: [] });
    db.checkins.push({ at: `${day(i)}T08:00:00.000Z`, live: true, reading: { skin: [{ trait: 'redness', level: i < 3 ? 'none' : 'noticeable' }] } });
  }
  const r = whatWorks(db).results[0];
  assert.equal(r.verdict, 'seems to help');
});
