// Loads .env.local from the repo root without overriding real environment variables.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function loadEnv(file = path.join(repoRoot, '.env.local')) {
  const content = await readFile(file, 'utf8').catch((e) => { if (e.code === 'ENOENT') return ''; throw e; });
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
