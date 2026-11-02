// Costume Buyer prototype server. No dependencies. Usage: node prototypes/costume-buyer/server.mjs [port]
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, dayDiff, lastSafeOrderDay, planParts, sourcePart, weatherParts } from './agent.mjs';
import { captureOrder, createApprovalOrder, loadEnv, payWithVault, refundCapture } from './services.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(root, 'data', 'state.json');
const port = Number(process.argv[2]) || 8091;
const baseUrl = `http://localhost:${port}`;
await loadEnv(path.join(root, '..', '..', '.env.local'));

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

// Demo memory: what this crew already owns. Seeded, and shown as seeded in the UI.
const seedKit = [
  { name: 'Black wig caps', qty: 6, source: 'told by you' },
  { name: 'Spirit gum, half bottle', qty: 1, source: 'told by you' },
  { name: 'EVA foam offcuts', qty: 1, source: 'told by you' },
  { name: 'Hot glue gun', qty: 2, source: 'receipt' },
];

function freshState() {
  return {
    project: {
      brief: 'Short historical film about a samurai retainer in the Edo period. Five actors, outdoor shoot, simple period robes, light foam armor for two actors, aged makeup and one scar.',
      cast: 5, budget: 600, shootDate: addDays(today(), 12), lat: -6.2, lon: 106.82, place: 'Jakarta',
      mandate: { askAbove: 80 },
    },
    day: today(), kit: seedKit, parts: [], purchases: [], log: [], weather: null, vaultId: null, pendingOrder: null, modelCost: 0,
  };
}

let state = await readFile(statePath, 'utf8').then(JSON.parse).catch(() => freshState());
const save = async () => {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 1));
  await rename(`${statePath}.tmp`, statePath);
};
const log = (kind, text) => state.log.unshift({ day: state.day, kind, text, at: new Date().toISOString() });
const spent = () => state.purchases.filter((p) => !p.refundId).reduce((n, p) => n + p.total, 0);
const costOf = (part) => part.pick.price * (part.qty || 1);

async function plan() {
  const { parts, cost } = await planParts(state.project, state.kit);
  const extra = await weatherParts(state.project);
  state.weather = extra.weather;
  state.parts = [...parts, ...extra.parts].map((p, i) => ({ ...p, id: `p${i + 1}`, status: 'todo', decidedOn: null }));
  state.modelCost += cost;
  log('plan', `Planned ${state.parts.length} parts from the brief.`);
  for (const p of extra.parts) log('weather', `${p.part}: ${p.why}`);
}

async function sourceAll() {
  for (const part of state.parts) {
    if (!['todo', 'wait'].includes(part.status)) continue;
    if (part.owned_name) {
      part.status = 'owned';
      part.why = `You already own: ${part.owned_name}.`;
      log('skip', `Didn't buy ${part.part}. ${part.why}`);
      continue;
    }
    try {
      const r = await sourcePart(part, state.project, state.day, spent());
      Object.assign(part, r, { decidedOn: state.day });
      state.modelCost += r.cost || 0;
      for (const x of r.rejects || []) log('reject', `${part.part}: rejected "${x.title.slice(0, 50)}". ${x.why}`);
      if (r.check?.fake) log('fake', `${part.part}: ${r.check.note}.`);
      log(r.status, `${part.part}: ${r.why}`);
    } catch (e) {
      part.status = 'error';
      part.why = e.message;
      log('error', `${part.part}: ${e.message}`);
    }
    await save();
  }
}

function recordPurchase(part, paid) {
  state.purchases.push({
    id: `b${state.purchases.length + 1}`, partId: part.id, part: part.part, title: part.pick.title, store: part.pick.store, total: costOf(part),
    day: state.day, returnBy: addDays(state.day, part.returnDays || 30), orderId: paid.orderId, captureId: paid.captureId, status: paid.captureStatus || paid.status, refundId: null,
  });
  part.status = 'bought';
  log('buy', `Bought ${part.part} from demo ${part.pick.store} for $${costOf(part).toFixed(2)}. PayPal capture ${paid.captureId}.`);
}

async function buyNext() {
  // The first buy needs a person: approving it once in PayPal saves the method for the agent.
  const first = state.parts.find((p) => p.status === 'buy');
  if (!first) return { done: true };
  if (!state.vaultId) {
    const { orderId, approveUrl } = await createApprovalOrder(`${first.part} (demo shop)`, costOf(first), first.id, baseUrl);
    state.pendingOrder = { orderId, partId: first.id };
    log('approve', `Needs your one approval in PayPal for the first buy: ${first.part}.`);
    return { approveUrl };
  }
  let bought = 0;
  for (const part of state.parts.filter((p) => p.status === 'buy')) {
    const paid = await payWithVault(state.vaultId, `${part.part} (demo shop)`, costOf(part), `${part.id}-${state.day}`);
    recordPurchase(part, paid);
    bought++;
    await save();
  }
  return { bought };
}

async function paypalReturn(orderId) {
  const pending = state.pendingOrder;
  if (!pending || pending.orderId !== orderId) throw new Error('Unknown order returned from PayPal');
  const paid = await captureOrder(orderId);
  const part = state.parts.find((p) => p.id === pending.partId);
  recordPurchase(part, paid);
  state.pendingOrder = null;
  if (paid.vaultId) {
    state.vaultId = paid.vaultId;
    log('mandate', `PayPal saved. The agent can now buy within your rule: under $${state.project.mandate.askAbove} per part, $${state.project.budget} in total.`);
  } else {
    log('error', 'PayPal captured the payment but returned no saved payment method. Later buys will need approval too.');
  }
}

async function refund(purchaseId, reason) {
  const p = state.purchases.find((x) => x.id === purchaseId);
  if (!p) throw new Error('Unknown purchase');
  if (p.refundId) return;
  if (dayDiff(p.returnBy, state.day) < 0) throw new Error(`Return window ended on ${p.returnBy}`);
  const r = await refundCapture(p.captureId, reason);
  p.refundId = r.refundId;
  p.status = `refunded: ${r.status}`;
  const part = state.parts.find((x) => x.id === p.partId);
  if (part) part.status = 'returned';
  log('refund', `Returned ${p.part}, $${p.total.toFixed(2)} back. PayPal refund ${r.refundId}.`);
}

// Runs on every simulated day: warns before a return window closes.
function nextDay(days) {
  state.day = addDays(state.day, days);
  for (const p of state.purchases.filter((x) => !x.refundId && !x.kept)) {
    const left = dayDiff(p.returnBy, state.day);
    if (left >= 0 && left <= 3) log('clock', `${p.part}: ${left} days left to return ($${p.total.toFixed(2)}). Keep it or send it back?`);
  }
  log('day', `Moved to ${state.day}. Last safe order day is ${lastSafeOrderDay(state.project.shootDate)}.`);
}

const view = () => ({ ...state, spent: spent(), lastSafeDay: lastSafeOrderDay(state.project.shootDate), hasPaypal: !!state.vaultId, vaultId: undefined });

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
const bodyOf = async (req) => { let t = ''; for await (const c of req) t += c; return t ? JSON.parse(t) : {}; };

let busy = false;
const exclusive = async (res, fn) => {
  if (busy) return send(res, 409, { error: 'The agent is still working' });
  busy = true;
  try {
    const extra = await fn();
    await save();
    send(res, 200, { ...view(), ...(extra || {}) });
  } catch (e) {
    console.error(e);
    log('error', e.message);
    await save();
    send(res, 502, { ...view(), error: e.message });
  } finally { busy = false; }
};

createServer(async (req, res) => {
  const url = new URL(req.url, baseUrl);
  if (url.pathname === '/') return send(res, 200, await readFile(path.join(root, 'index.html')), 'text/html; charset=utf-8');
  if (url.pathname === '/api/state') return send(res, 200, view());
  if (url.pathname === '/paypal/return') {
    if (busy) return send(res, 409, 'Busy, reload in a moment.', 'text/plain');
    busy = true;
    try { await paypalReturn(url.searchParams.get('token')); await save(); }
    catch (e) { console.error(e); log('error', e.message); await save(); }
    finally { busy = false; }
    res.writeHead(302, { location: '/' });
    return res.end();
  }
  if (url.pathname === '/paypal/cancel') {
    state.pendingOrder = null;
    log('approve', 'PayPal approval cancelled. Nothing was charged.');
    await save();
    res.writeHead(302, { location: '/' });
    return res.end();
  }
  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  const body = await bodyOf(req).catch(() => ({}));
  switch (url.pathname) {
    case '/api/plan': return exclusive(res, plan);
    case '/api/source': return exclusive(res, sourceAll);
    case '/api/buy': return exclusive(res, buyNext);
    case '/api/refund': return exclusive(res, () => refund(body.id, body.reason || 'Not used for the shoot'));
    case '/api/keep': return exclusive(res, () => {
      const p = state.purchases.find((x) => x.id === body.id);
      if (p) { p.kept = true; log('keep', `Keeping ${p.part}.`); }
    });
    case '/api/approve': return exclusive(res, () => {
      const part = state.parts.find((p) => p.id === body.id && p.status === 'ask');
      if (part) { part.status = 'buy'; log('approve', `You approved ${part.part}.`); }
    });
    case '/api/day': return exclusive(res, () => nextDay(Number(body.days) || 1));
    case '/api/reset': return exclusive(res, () => { state = freshState(); });
    default: return send(res, 404, { error: 'not found' });
  }
}).listen(port, () => console.log(`Costume Buyer prototype: ${baseUrl}`));
