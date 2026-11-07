// Our own price log (experiments/price-log): Channel3's ~30 days saved at seed time, plus one snapshot
// per day since Nov 2 on days the logging PC runs. It counts for more than a store's "was" price.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from './env.mjs';
import { priceHistory as channel3History } from './channel3.mjs';

const dir = () => process.env.PRICE_LOG_DIR || path.join(repoRoot, 'experiments', 'price-log', 'data');
let cache = null;

async function load() {
  if (cache) return cache;
  const map = new Map();
  const add = (id, at, price, source) => { if (price == null) return; if (!map.has(id)) map.set(id, []); map.get(id).push({ at: at.slice(0, 10), price, source }); };
  const backfill = await readFile(path.join(dir(), 'backfill.jsonl'), 'utf8').catch(() => '');
  for (const line of backfill.split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    for (const h of r.history || []) add(r.id, h.timestamp, h.price, 'channel3-backfill');
  }
  const snapDir = path.join(dir(), 'snapshots');
  for (const f of (await readdir(snapDir).catch(() => [])).filter((x) => x.endsWith('.json')).sort()) {
    const s = JSON.parse(await readFile(path.join(snapDir, f), 'utf8'));
    for (const p of s.products || []) {
      const prices = (p.offers || []).filter((o) => o.price != null && o.currency === 'USD').map((o) => o.price);
      if (prices.length) add(p.id, s.date || f.slice(0, 10), Math.min(...prices), 'our-snapshot');
    }
  }
  for (const [id, rows] of map) {
    // One price per day; our own snapshot wins over the backfill for the same day.
    const byDay = new Map();
    for (const r of rows) if (!byDay.has(r.at) || r.source === 'our-snapshot') byDay.set(r.at, r);
    map.set(id, [...byDay.values()].sort((a, b) => a.at.localeCompare(b.at)));
  }
  cache = map;
  return map;
}

export async function watchlist() {
  const w = JSON.parse(await readFile(path.join(dir(), 'watchlist.json'), 'utf8').catch(() => '{"items":[]}'));
  return w.items || w.products || [];
}

// Our log first; Channel3's live history as the fallback and second opinion.
export async function historyFor(productId) {
  const ours = (await load()).get(productId);
  if (ours?.length) return { rows: ours, source: 'our log', ourDays: ours.filter((r) => r.source === 'our-snapshot').length };
  const c3 = await channel3History(productId).catch(() => []);
  return { rows: c3.map((h) => ({ at: h.at.slice(0, 10), price: h.price, source: 'channel3' })), source: 'Channel3', ourDays: 0 };
}

export function summarize(rows) {
  const prices = rows.map((r) => r.price);
  if (!prices.length) return { days: 0, low: null, high: null };
  return { days: prices.length, low: Math.min(...prices), high: Math.max(...prices), first: rows[0].at, last: rows.at(-1).at };
}

// Products whose price actually moved: the honest demo material.
export async function movers() {
  const map = await load();
  const items = await watchlist();
  return items.map((i) => ({ ...i, rows: map.get(i.id) || [] }))
    .filter((i) => new Set(i.rows.map((r) => r.price)).size > 1)
    .map((i) => ({ id: i.id, title: i.title, brand: i.brand, query: i.query, ...summarize(i.rows), now: i.rows.at(-1).price }));
}
