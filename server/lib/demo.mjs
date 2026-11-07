// The demo bundle in server/demo: a snapshot of the seeded persona (database and item photos), a copy of our
// price log, and two generated face frames. A fresh clone or a hosted server starts from it without spending
// anything, and on a public demo a reset goes back to it instead of to an empty app.
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from './env.mjs';
import { file as dbFile } from './store.mjs';
import { dir as photoDir } from './photos.mjs';

export const demoDir = path.join(repoRoot, 'server', 'demo');
const demoDb = path.join(demoDir, 'db.json');
const demoPhotos = path.join(demoDir, 'photos');

// Private or one-off state that must never ship in the public repo.
// PayPal ids and the store's sandbox email are reduced to status and amount; ids in log text are blanked.
const PAYPAL_ID = /\b(?=[A-Z0-9]*\d)[A-Z0-9]{12,20}\b/g; // ids mix capitals and digits
export function scrub(db) {
  const copy = structuredClone(db);
  Object.assign(copy.settings, { vaultId: null, pendingOrder: null, pendingMandate: null });
  for (const d of copy.decisions) if (d.paypal) d.paypal = { status: d.paypal.status || 'authorized', amount: d.paypal.amount ?? d.paypal.authorized ?? null, demo: true };
  for (const l of copy.log) if (/PayPal|Authorized|capture|refund/i.test(l.text)) l.text = l.text.replace(PAYPAL_ID, '…');
  for (const m of copy.chat) if (m.text) m.text = m.text.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '…');
  return copy;
}

export async function saveDemo(db) {
  await mkdir(demoPhotos, { recursive: true });
  const text = JSON.stringify(scrub(db), null, 1);
  await writeFile(demoDb, text);
  for (const f of await readdir(demoPhotos)) if (!text.includes(f)) await rm(path.join(demoPhotos, f));
  let photos = 0;
  for (const f of await readdir(photoDir()).catch(() => [])) {
    if (text.includes(f)) { await cp(path.join(photoDir(), f), path.join(demoPhotos, f)); photos++; }
  }
  return { photos, bytes: text.length };
}

export const hasDemo = () => existsSync(demoDb);

// Copies the bundle into the live data folders. Returns the database object, or null when there is no bundle.
export async function restoreDemo() {
  if (!hasDemo()) return null;
  await mkdir(photoDir(), { recursive: true });
  for (const f of await readdir(demoPhotos).catch(() => [])) await cp(path.join(demoPhotos, f), path.join(photoDir(), f));
  const db = JSON.parse(await readFile(demoDb, 'utf8'));
  await mkdir(path.dirname(dbFile()), { recursive: true });
  await writeFile(dbFile(), JSON.stringify(db, null, 1));
  return db;
}

// First boot of a fresh clone or a hosted server: start from the demo instead of an empty app.
export async function restoreDemoIfEmpty() {
  if (existsSync(dbFile())) return false;
  return !!(await restoreDemo());
}
