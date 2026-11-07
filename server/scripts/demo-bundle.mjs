// Refreshes the demo bundle in server/demo from the live data: the seeded database (private state removed),
// the photos it uses, and a copy of the price log. Run after `npm run seed`, then commit server/demo.
// Usage: node server/scripts/demo-bundle.mjs
import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv, repoRoot } from '../lib/env.mjs';

await loadEnv();
const { load } = await import('../lib/store.mjs');
const { saveDemo, demoDir } = await import('../lib/demo.mjs');

const db = await load();
if (!db.items.length) { console.error('The database is empty. Run the server and `npm run seed` first.'); process.exit(1); }
const { photos, bytes } = await saveDemo(db);
console.log(`✔ database ${Math.round(bytes / 1024)} KB, ${photos} photos`);

const log = path.join(repoRoot, 'experiments', 'price-log', 'data');
if (existsSync(log)) {
  const out = path.join(demoDir, 'prices');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const f of ['watchlist.json', 'backfill.jsonl', 'snapshots']) await cp(path.join(log, f), path.join(out, f), { recursive: true });
  console.log('✔ price log copied');
} else console.log('- no live price log here; kept the bundled copy');
