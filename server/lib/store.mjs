// Tiny JSON store. One file, written atomically. Fine for a single-user demo server.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { repoRoot } from './env.mjs';
import { SEED_POLICY } from './policy.mjs';

const file = () => process.env.DB_FILE || path.join(repoRoot, 'server', 'data', 'db.json');

export function emptyDb() {
  return {
    settings: {
      rules: { askAbove: 40, monthlyBudget: 120 },
      location: { lat: -6.2, lon: 106.82, label: 'Jakarta' },
      vaultId: null, pendingOrder: null,
    },
    items: [], checkins: [], reactions: [], decisions: [], watchJobs: [], log: [],
    memories: [], diary: [], looks: [], chat: [],
    policies: [{ ...SEED_POLICY, activatedAt: new Date().toISOString(), testResults: null }],
    shelfDrafts: [],
  };
}

let db = null;
export async function load() {
  if (db) return db;
  db = await readFile(file(), 'utf8').then(JSON.parse).catch(() => emptyDb());
  for (const [k, v] of Object.entries(emptyDb())) if (db[k] === undefined) db[k] = v; // older files gain new collections
  return db;
}
export async function save() {
  await mkdir(path.dirname(file()), { recursive: true });
  await writeFile(`${file()}.tmp`, JSON.stringify(db, null, 1));
  await rename(`${file()}.tmp`, file());
}
// Reset in place: other modules hold a reference to this same object.
export function reset(next = emptyDb()) {
  if (!db) { db = next; return db; }
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, next);
  return db;
}

export const id = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`;
export const now = () => new Date().toISOString();
export const activePolicy = () => db.policies.filter((p) => p.activatedAt).at(-1);
export function log(kind, text, extra = {}) {
  db.log.unshift({ id: id('log'), at: now(), kind, text, ...extra });
  db.log.length = Math.min(db.log.length, 500);
}
