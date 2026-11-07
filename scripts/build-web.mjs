// Exports the app's web build into mobile/dist for the server to serve. The API URL is forced empty so the
// web app calls the same origin it was loaded from, whatever mobile/.env.local says for the phone build.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mobile');
const r = spawnSync('npx', ['expo', 'export', '-p', 'web', '--output-dir', 'dist'], {
  cwd: mobile, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, EXPO_PUBLIC_API_URL: '' },
});
process.exit(r.status ?? 1);
