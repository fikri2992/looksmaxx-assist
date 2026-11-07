// Item photos and generated looks, stored as files next to the database. Selfies are never stored here:
// check-ins keep only the text reading.
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { repoRoot } from './env.mjs';

const dir = () => process.env.PHOTO_DIR || path.join(repoRoot, 'server', 'data', 'photos');

export async function savePhoto(dataUrlOrBuffer, ext = 'jpg') {
  const bytes = Buffer.isBuffer(dataUrlOrBuffer) ? dataUrlOrBuffer : Buffer.from(String(dataUrlOrBuffer).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (bytes.length > 8_000_000) throw new Error('Photo too large');
  const id = `${randomUUID().slice(0, 12)}.${ext}`;
  await mkdir(dir(), { recursive: true });
  await writeFile(path.join(dir(), id), bytes);
  return id;
}

export async function readPhoto(id) {
  if (!/^[a-f0-9-]{12}\.(jpg|png|mp3)$/.test(id)) throw new Error('bad photo id');
  return readFile(path.join(dir(), id));
}

// Deletes photo files nothing in the database points at (left behind by resets and replaced photos).
export async function prunePhotos(db) {
  const text = JSON.stringify(db);
  const files = await readdir(dir()).catch(() => []);
  const orphans = files.filter((f) => /^[a-f0-9-]{12}\.(jpg|png|mp3)$/.test(f) && !text.includes(f));
  await Promise.all(orphans.map((f) => unlink(path.join(dir(), f))));
  return orphans.length;
}
