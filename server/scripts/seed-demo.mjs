// Seeds the demo persona through the real API, so every decision on screen was made by the real engine.
// Everything seeded is labelled "demo data"; face photos are generated images of a fictional person, and
// clothing photos are generated once and cached in server/demo/seed-photos so reseeding costs nothing.
// Usage: node server/scripts/seed-demo.mjs [http://localhost:8095] [--no-photos]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv, repoRoot } from '../lib/env.mjs';

await loadEnv();
const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:8095';
const withPhotos = !process.argv.includes('--no-photos');
const call = async (method, route, body) => {
  const res = await fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (data.error) console.warn(`  ! ${route}: ${data.error}`);
  return data;
};
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const dataUrl = (bytes, type) => `data:${type};base64,${bytes.toString('base64')}`;
const photoCache = path.join(repoRoot, 'server', 'demo', 'seed-photos');

async function productPhoto(key, description) {
  const file = path.join(photoCache, `${key}.jpg`);
  const cached = await readFile(file).catch(() => null);
  if (cached) return dataUrl(cached, 'image/jpeg');
  if (!withPhotos) return null;
  const { makeImage } = await import('../lib/openai.mjs');
  const jpg = await makeImage(`Clean product photo of a single ${description}, laid flat on a warm off-white background, soft daylight, no people, no text, no logos, no brand marks.`);
  await mkdir(photoCache, { recursive: true });
  await writeFile(file, jpg);
  return dataUrl(jpg, 'image/jpeg');
}

await call('POST', '/api/reset');

const items = [
  { key: 'cleanser', name: 'Gentle gel cleanser', category: 'skincare', type: 'cleanser', opened: daysAgo(40) },
  { key: 'ceramide', name: 'Ceramide barrier moisturizer', category: 'skincare', type: 'moisturizer', opened: daysAgo(52) },
  { key: 'retinol', name: 'Retinol night serum', category: 'skincare', type: 'serum', opened: daysAgo(20) },
  { key: 'spf', name: 'Mineral sunscreen SPF 50', category: 'skincare', type: 'sunscreen', opened: daysAgo(41) },
  { key: 'lipstick', name: 'Nude matte lipstick', category: 'makeup', type: 'lipstick', color: 'nude', shade: '#C08A74', finish: 'matte', opened: daysAgo(30) },
  { key: 'brow', name: 'Brown brow pencil', category: 'makeup', type: 'brow', color: 'brown', opened: daysAgo(70) },
  { key: 'blush', name: 'Rose cream blush', category: 'makeup', type: 'blush', color: 'rose', shade: '#C97B84', finish: 'dewy', opened: daysAgo(90) },
  { key: 'mascara', name: 'Black lengthening mascara', category: 'makeup', type: 'mascara', color: 'black', shade: '#1E1A17', opened: daysAgo(120) },
  { key: 'linen-top', name: 'Black linen top', category: 'wardrobe', type: 'top', color: 'black', photo: 'black sleeveless linen top', wears: [12, 5] },
  { key: 'tee', name: 'Black cotton tee', category: 'wardrobe', type: 'top', color: 'black', photo: 'plain black crew-neck cotton t-shirt', wears: [9, 6, 2] },
  { key: 'blouse', name: 'Black silk blouse', category: 'wardrobe', type: 'top', color: 'black', photo: 'black silk button-up blouse', wears: [] },
  { key: 'knit', name: 'Black knit top', category: 'wardrobe', type: 'top', color: 'black', photo: 'black fine-knit short-sleeve top', wears: [20] },
  { key: 'trousers', name: 'Beige linen trousers', category: 'wardrobe', type: 'bottom', color: 'beige', photo: 'pair of beige wide-leg linen trousers', wears: [12, 3] },
  { key: 'skirt', name: 'Olive midi skirt', category: 'wardrobe', type: 'bottom', color: 'olive', photo: 'olive green satin midi skirt', wears: [] },
  { key: 'blazer', name: 'Black blazer', category: 'wardrobe', type: 'outerwear', color: 'black', photo: 'black single-breasted blazer', wears: [7] },
  { key: 'loafers', name: 'Tan leather loafers', category: 'wardrobe', type: 'shoes', color: 'tan', photo: 'pair of tan leather loafers', wears: [12, 7, 3] },
];
for (const { key, photo, wears, ...item } of items) {
  const image = photo ? await productPhoto(key, photo) : null;
  await call('POST', '/api/items', { item: { ...item, source: 'demo data', wears: (wears || []).map(daysAgo), ...(image ? { photo: image } : {}) } });
  process.stdout.write(image ? 'p' : '.');
}
const state = await call('GET', '/api/state');
const idOf = (name) => state.items.find((i) => i.name === name)?.id;
console.log(`\n✔ ${items.length} items`);

// Twelve demo diary days with a pattern the analysis should find: retinol nights tend to be tighter.
for (let n = 12; n >= 1; n--) {
  const retinol = n % 2 === 0;
  await call('POST', '/api/diary', {
    date: daysAgo(n), am: [idOf('Gentle gel cleanser'), idOf('Ceramide barrier moisturizer'), idOf('Mineral sunscreen SPF 50')],
    pm: [idOf('Gentle gel cleanser'), ...(retinol ? [idOf('Retinol night serum')] : [idOf('Ceramide barrier moisturizer')])],
    feel: retinol ? (n % 4 === 0 ? 'Itchy' : 'Tight') : (n % 3 === 0 ? 'Glowing' : 'Calm'), notes: 'demo data',
  });
}
console.log('✔ 12 diary days');

const fixtures = 'server/demo/faces'; // generated portraits of a fictional adult
for (const [frame, ago] of [['frame-01.jpg', 9], ['frame-04.jpg', 3]]) {
  const bytes = await readFile(path.join(repoRoot, fixtures, frame)).catch(() => null);
  if (!bytes) { console.warn(`  ! missing ${frame}`); continue; }
  const s = await call('POST', '/api/checkin', { image: dataUrl(bytes, 'image/jpeg'), seeded: true, at: daysAgo(ago) });
  console.log(`✔ check-in ${frame}: ${(s.checkins?.find((c) => c.at.startsWith(daysAgo(ago)))?.reading?.skin || []).map((x) => `${x.trait}=${x.level}`).join(', ')}`);
}

const r = await call('POST', '/api/remember', { text: 'The vitamin C serum I tried last month stung my cheeks and left them red.' });
console.log(`✔ reaction remembered; rules now v${r.policy?.version}`);
await call('POST', '/api/agent', { text: 'Remember that I prefer fragrance-free skincare, I wear size M tops, and I mostly dress smart casual for a hot office.' });
console.log('✔ preferences told to the agent');

const p = await call('POST', '/api/plan', { goal: 'Keep my daily skincare stocked for hot, high-UV days, and a natural makeup look for work.' });
for (const d of p.decisions || []) console.log(`  ${d.verdict.padEnd(4)} ${d.need.need} → ${d.product ? `${d.product.title.slice(0, 44)} $${d.product.price}` : d.note || ''}`);
// The core moment: asking for something the closet already covers should end in a skip.
const p2 = await call('POST', '/api/plan', { goal: 'I think I need another plain black top for the office.' });
for (const d of p2.decisions?.slice(0, 2) || []) console.log(`  ${d.verdict.padEnd(4)} ${d.need.need} → ${d.product ? d.product.title.slice(0, 44) : d.note || ''}`);

// Make sure the demo shows a price watch: if the plan didn't wait on anything, watch the first "ask" at its low.
const afterPlan = await call('GET', '/api/state');
if (!afterPlan.watchJobs.length) {
  const d = afterPlan.decisions.find((x) => x.product && ['ask', 'wait'].includes(x.verdict));
  if (d) { await call('POST', '/api/watch', { id: d.id }); console.log(`✔ watching ${d.product.title.slice(0, 40)}`); }
}
await call('POST', '/api/outfit');
const final = await call('GET', '/api/state');
console.log(`✔ insights: ${final.insights.results.filter((x) => x.verdict !== 'not enough data').map((x) => `${x.name} ${x.verdict}`).join('; ')}`);
console.log(`✔ outfit: ${final.outfit?.reason}`);
