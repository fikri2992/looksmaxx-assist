// Seeds the demo persona through the real API, so every decision on screen was made by the real engine.
// Everything seeded is labelled "demo data"; the face photos are generated images of a fictional person.
// Usage: node server/scripts/seed-demo.mjs [http://localhost:8095]
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from '../lib/env.mjs';

const base = process.argv[2] || 'http://localhost:8095';
const call = async (method, route, body) => {
  const res = await fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (data.error) console.warn(`  ! ${route}: ${data.error}`);
  return data;
};
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const photo = async (rel) => `data:image/png;base64,${(await readFile(path.join(repoRoot, rel))).toString('base64')}`;

await call('POST', '/api/reset');
const items = [
  { name: 'Gentle gel cleanser', category: 'skincare', type: 'cleanser', opened: daysAgo(40) },
  { name: 'Daily moisturizer', category: 'skincare', type: 'moisturizer', opened: daysAgo(52) },
  { name: 'Mineral sunscreen SPF 50', category: 'skincare', type: 'sunscreen', opened: daysAgo(41) },
  { name: 'Nude matte lipstick', category: 'makeup', type: 'lipstick', color: 'nude', opened: daysAgo(30) },
  { name: 'Brown brow pencil', category: 'makeup', type: 'brow', color: 'brown', opened: daysAgo(70) },
  { name: 'Black linen top', category: 'wardrobe', type: 'top', color: 'black' },
  { name: 'Black cotton tee', category: 'wardrobe', type: 'top', color: 'black' },
  { name: 'Black silk blouse', category: 'wardrobe', type: 'top', color: 'black' },
  { name: 'Black knit top', category: 'wardrobe', type: 'top', color: 'black' },
];
for (const item of items) await call('POST', '/api/items', { item: { ...item, source: 'demo data' } });
console.log(`✔ ${items.length} items`);

const fixtures = 'experiments/face-measure/public/fixtures/skin-sequence-v1';
for (const [frame, ago] of [['frame-01.png', 9], ['frame-04.png', 3]]) {
  const s = await call('POST', '/api/checkin', { image: await photo(`${fixtures}/${frame}`), seeded: true, at: daysAgo(ago) });
  console.log(`✔ check-in ${frame}: ${(s.checkins?.[0]?.reading?.skin || []).map((x) => `${x.trait}=${x.level}`).join(', ')}`);
}

const r = await call('POST', '/api/remember', { text: 'The vitamin C serum I tried last month stung my cheeks and left them red. My daily moisturizer is almost gone.' });
console.log(`✔ reaction remembered; rules now v${r.policy?.version}: ${r.policyVersions?.at(-1)?.reason}`);

const p = await call('POST', '/api/plan', { goal: 'Keep my daily skincare stocked for hot, high-UV days, and a natural makeup look for work.' });
for (const d of p.decisions || []) console.log(`  ${d.verdict.padEnd(4)} ${d.need.need} → ${d.product ? `${d.product.title.slice(0, 44)} $${d.product.price}` : d.note || ''}`);
console.log(`✔ model spend this server run: $${(p.modelSpend || 0).toFixed(3)}`);
