// Day-1 gate: prove the money path before building anything else.
//   node server/scripts/payment-gate.mjs           first run: prints a PayPal approval link
//   node server/scripts/payment-gate.mjs continue  after approving: authorize → capture to the store, then authorize → void
// Needs STORE_SANDBOX_EMAIL in .env.local: a second sandbox business account that plays the store.
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv, repoRoot } from '../lib/env.mjs';
import { authorizeApproved, authorizeWithVault, captureAuthorization, capturePayee, createMandateOrder, voidAuthorization } from '../lib/paypal.mjs';

await loadEnv();
const statePath = path.join(repoRoot, 'server', 'data', 'payment-gate.json');
const store = process.env.STORE_SANDBOX_EMAIL;
if (!store) { console.error('Set STORE_SANDBOX_EMAIL in .env.local to a second sandbox business account first.'); process.exit(1); }
const port = 8094;
const save = async (s) => { await mkdir(path.dirname(statePath), { recursive: true }); await writeFile(statePath, JSON.stringify(s, null, 1)); };
const step = (name, data) => console.log(`✔ ${name}`, JSON.stringify(data));

if (process.argv[2] !== 'continue') {
  const { orderId, approveUrl } = await createMandateOrder({ description: 'Gate test: first purchase', amount: 1.25, customId: `gate-${Date.now()}`, payeeEmail: store }, `http://localhost:${port}`);
  await save({ orderId });
  console.log(`Approve here with the sandbox buyer, then this script finishes by itself:\n${approveUrl}`);
  // Wait for PayPal to send the browser back.
  createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/paypal/cancel') { res.end('Cancelled. Nothing was held.'); process.exit(1); }
    if (url.pathname !== '/paypal/return') { res.writeHead(404); return res.end(); }
    res.end('Approved. You can close this tab and go back to the terminal.');
    await finish(url.searchParams.get('token'));
    process.exit(0);
  }).listen(port);
} else {
  const { orderId } = JSON.parse(await readFile(statePath, 'utf8'));
  await finish(orderId);
}

async function finish(orderId) {
  const first = await authorizeApproved(orderId);
  step('approved order authorized', { authStatus: first.authStatus, saved: !!first.vaultId });
  const cap = await captureAuthorization(first.authId);
  step('captured', cap);
  step('payee on PayPal record', await capturePayee(cap.captureId));
  if (!first.vaultId) { console.log('✘ No saved method returned, so the agent cannot pay alone.'); return; }

  const second = await authorizeWithVault(first.vaultId, { description: 'Gate test: agent buys, then the final check passes', amount: 2.5, customId: `gate-cap-${Date.now()}`, payeeEmail: store });
  step('agent authorized with saved method', second);
  const cap2 = await captureAuthorization(second.authId);
  step('agent captured', cap2);
  step('payee on PayPal record', await capturePayee(cap2.captureId));

  const third = await authorizeWithVault(first.vaultId, { description: 'Gate test: agent buys, then the final check fails', amount: 3.75, customId: `gate-void-${Date.now()}`, payeeEmail: store });
  step('agent authorized again', third);
  step('voided after a failed final check', await voidAuthorization(third.authId));
  await save({ orderId, vaultId: first.vaultId, passedAt: new Date().toISOString() });
  console.log('GATE PASSED: the store was paid with the saved method, and a hold was released.');
}
