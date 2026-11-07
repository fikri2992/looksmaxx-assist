// PROTOTYPE beauty agent server. No dependencies. Usage: node prototypes/beauty-agent/server.mjs [port]
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, compareCheckins, dayDiff, planNeeds, readFace, readShelf, rememberText, runOut, sourceNeed } from './agent.mjs';
import { captureOrder, createApprovalOrder, loadEnv, payWithVault, refundCapture } from '../costume-buyer/services.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(root, 'data', 'prototype-state-wipe-me.json');
const experiments = path.join(root, '..', '..', 'experiments');
// Face samples are generated images of a fictional person.
const SAMPLES = {
  '/sample/shelf.jpg': ['image/jpeg', path.join(experiments, 'photo-test', 'data', 'photos', 'cosmetics.jpg')],
  '/sample/face-1.png': ['image/png', path.join(experiments, 'face-measure', 'public', 'fixtures', 'skin-sequence-v1', 'frame-01.png')],
  '/sample/face-2.png': ['image/png', path.join(experiments, 'face-measure', 'public', 'fixtures', 'skin-sequence-v1', 'frame-04.png')],
};
const port = Number(process.argv[2]) || 8092;
const baseUrl = `http://localhost:${port}`;
const SPEND_CAP = 1; // USD of model calls per reset, so testing can't run away with the credit
const RETURN_DAYS = 30; // demo shops' return window
await loadEnv(path.join(root, '..', '..', '.env.local'));

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

function freshState() {
  const t = today();
  return {
    day: t, goal: 'A simple daily routine for dry, sensitive skin, and a natural makeup look for work.',
    // Demo memory, seeded and labelled as such in the UI.
    memory: {
      rules: { askAbove: 40, monthlyBudget: 120 },
      owned: [
        { name: 'Gentle gel cleanser', type: 'cleanser', opened: addDays(t, -40), source: 'seeded demo' },
        { name: 'Daily moisturizer', type: 'moisturizer', opened: addDays(t, -52), source: 'seeded demo' },
        { name: 'Mineral sunscreen SPF 50', type: 'sunscreen', opened: addDays(t, -41), source: 'seeded demo' },
        { name: 'Nude matte lipstick', type: 'lipstick', opened: addDays(t, -30), source: 'seeded demo' },
      ],
      reactions: [{ item: 'Rose toner', note: 'stung and left redness', avoid: ['fragrance', 'perfume', 'rose'], source: 'seeded demo' }],
      preferences: ['Prefers fragrance-free'],
      checkins: [],
    },
    shelfDraft: [], needs: [], purchases: [], log: [], vaultId: null, pendingOrder: null, modelCost: 0,
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
const charge = (cost) => { state.modelCost += cost || 0; };
const guardSpend = () => { if (state.modelCost >= SPEND_CAP) throw new Error(`Model spend cap of $${SPEND_CAP} reached. Reset to continue.`); };

async function shelf(image) {
  guardSpend();
  const { items, cost } = await readShelf(image);
  charge(cost);
  state.shelfDraft = items.map((it, i) => ({ ...it, id: `s${i + 1}`, keep: it.readable !== false && it.confidence >= 0.8 }));
  log('photo', `Read ${items.length} products from the shelf photo. Nothing is saved until you confirm. The photo itself was not kept.`);
}

function confirmShelf(ids) {
  const keep = state.shelfDraft.filter((s) => ids.includes(s.id));
  for (const s of keep) {
    const name = s.brand ? `${s.brand} ${s.name}` : s.name;
    if (!state.memory.owned.some((o) => o.name === name)) state.memory.owned.push({ name, type: s.type, opened: null, source: 'photo, you confirmed' });
  }
  log('memory', `Saved ${keep.length} products you confirmed.`);
  state.shelfDraft = [];
}

async function checkin(image) {
  guardSpend();
  const { reading, cost } = await readFace(image);
  charge(cost);
  const prev = state.memory.checkins[0]?.reading;
  const changes = compareCheckins(prev, reading);
  state.memory.checkins.unshift({ day: state.day, reading, changes });
  log('photo', reading.usable === false ? `Check-in photo not usable: ${reading.photo_problem}` : `Check-in saved as text. The photo itself was not kept.${changes.length ? ` Changed: ${changes.join('; ')}.` : ''}`);
}

async function remember(text) {
  guardSpend();
  const r = await rememberText(text, state.memory.owned);
  charge(r.cost);
  for (const x of r.reactions || []) state.memory.reactions.push({ ...x, source: 'you said' });
  for (const x of r.preferences || []) if (!state.memory.preferences.includes(x)) state.memory.preferences.push(x);
  for (const o of state.memory.owned) {
    if ((r.low || []).includes(o.name)) o.runningLow = true;
    if ((r.finished || []).includes(o.name)) o.finished = true;
  }
  log('memory', `Remembered from you: ${[...(r.reactions || []).map((x) => `${x.item} (${x.note})`), ...(r.preferences || []), ...(r.low || []).map((x) => `${x} is low`), ...(r.finished || []).map((x) => `${x} is finished`)].join('; ') || 'nothing new'}.`);
}

async function plan(goal) {
  guardSpend();
  if (goal) state.goal = goal;
  const { needs, cost } = await planNeeds(state.goal, state.memory, state.day);
  charge(cost);
  state.needs = needs.map((n, i) => ({ ...n, id: `n${i + 1}`, status: 'todo' }));
  log('plan', `Worked out ${state.needs.length} needs for your goal.`);
  await save();
  for (const need of state.needs) {
    guardSpend();
    try {
      const r = await sourceNeed(need, state.memory, state.day, spent());
      Object.assign(need, r);
      charge(r.cost);
      for (const x of r.rejects || []) log('reject', `${need.need}: rejected "${x.title.slice(0, 50)}". ${x.why}`);
      if (r.check?.fake) log('fake', `${need.need}: ${r.check.note}.`);
      log(r.status, `${need.need}: ${r.why}`);
    } catch (e) {
      need.status = 'error';
      need.why = e.message;
      log('error', `${need.need}: ${e.message}`);
    }
    await save();
  }
}

function recordPurchase(need, paid) {
  state.purchases.push({
    id: `b${state.purchases.length + 1}`, needId: need.id, title: need.pick.title, store: need.pick.store, total: need.pick.price, day: state.day,
    returnBy: addDays(state.day, RETURN_DAYS), orderId: paid.orderId, captureId: paid.captureId, refundId: null,
  });
  need.status = 'bought';
  state.memory.owned.push({ name: need.pick.title, type: need.type, opened: null, source: 'bought by agent', bought: state.day });
  log('buy', `Bought ${need.need} from demo ${need.pick.store} for $${need.pick.price.toFixed(2)}. PayPal capture ${paid.captureId}.`);
}

async function buy() {
  // The first buy needs a person: approving it once in PayPal saves the method for the agent.
  const first = state.needs.find((n) => n.status === 'buy');
  if (!first) return { done: true };
  if (!state.vaultId) {
    const { orderId, approveUrl } = await createApprovalOrder(`${first.need} (demo shop)`, first.pick.price, first.id, baseUrl);
    state.pendingOrder = { orderId, needId: first.id };
    log('approve', `Needs your one approval in PayPal for the first buy: ${first.need}.`);
    return { approveUrl };
  }
  for (const need of state.needs.filter((n) => n.status === 'buy')) {
    recordPurchase(need, await payWithVault(state.vaultId, `${need.need} (demo shop)`, need.pick.price, `${need.id}-${state.day}-${need.pick.productId}`));
    await save();
  }
  return {};
}

async function paypalReturn(orderId) {
  const pending = state.pendingOrder;
  if (!pending || pending.orderId !== orderId) throw new Error('Unknown order returned from PayPal');
  const paid = await captureOrder(orderId);
  recordPurchase(state.needs.find((n) => n.id === pending.needId), paid);
  state.pendingOrder = null;
  if (paid.vaultId) {
    state.vaultId = paid.vaultId;
    log('mandate', `PayPal saved. The agent can buy alone under $${state.memory.rules.askAbove} per item and $${state.memory.rules.monthlyBudget} a month.`);
  } else log('error', 'PayPal captured the payment but returned no saved payment method.');
}

async function refund(id, reason) {
  const p = state.purchases.find((x) => x.id === id);
  if (!p) throw new Error('Unknown purchase');
  if (p.refundId) return;
  if (dayDiff(p.returnBy, state.day) < 0) throw new Error(`Return window ended on ${p.returnBy}`);
  const r = await refundCapture(p.captureId, reason);
  p.refundId = r.refundId;
  const need = state.needs.find((x) => x.id === p.needId);
  if (need) need.status = 'returned';
  state.memory.owned = state.memory.owned.filter((o) => o.name !== p.title);
  log('refund', `Returned ${p.title.slice(0, 50)}, $${p.total.toFixed(2)} back. PayPal refund ${r.refundId}.`);
}

function nextDay(days) {
  state.day = addDays(state.day, days);
  for (const o of state.memory.owned) {
    const r = runOut(o, state.day);
    if (r.daysLeft != null && r.daysLeft <= 7) log('clock', `${o.name}: about ${Math.max(r.daysLeft, 0)} days left (${r.basis}).`);
  }
  log('day', `Moved to ${state.day}.`);
}

const view = () => ({ ...state, spent: spent(), hasPaypal: !!state.vaultId, vaultId: undefined,
  memory: { ...state.memory, owned: state.memory.owned.map((o) => ({ ...o, ...runOut(o, state.day) })) } });

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
    charge(e.cost);
    log('error', e.message);
    await save();
    send(res, 502, { ...view(), error: e.message });
  } finally { busy = false; }
};

createServer(async (req, res) => {
  const url = new URL(req.url, baseUrl);
  if (url.pathname === '/') return send(res, 200, await readFile(path.join(root, 'index.html')), 'text/html; charset=utf-8');
  if (url.pathname === '/api/state') return send(res, 200, view());
  if (SAMPLES[url.pathname]) return readFile(SAMPLES[url.pathname][1]).then((f) => send(res, 200, f, SAMPLES[url.pathname][0]), () => send(res, 404, { error: 'sample photo missing' }));
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
    case '/api/shelf': return exclusive(res, () => shelf(body.image));
    case '/api/shelf/confirm': return exclusive(res, () => confirmShelf(body.ids || []));
    case '/api/checkin': return exclusive(res, () => checkin(body.image));
    case '/api/remember': return exclusive(res, () => remember(body.text || ''));
    case '/api/plan': return exclusive(res, () => plan(body.goal));
    case '/api/buy': return exclusive(res, buy);
    case '/api/refund': return exclusive(res, () => refund(body.id, 'Returned to demo shop'));
    case '/api/approve': return exclusive(res, () => {
      const need = state.needs.find((n) => n.id === body.id && n.status === 'ask');
      if (need) { need.status = 'buy'; log('approve', `You approved ${need.need}.`); }
    });
    case '/api/day': return exclusive(res, () => nextDay(Number(body.days) || 1));
    case '/api/reset': return exclusive(res, () => { state = freshState(); });
    default: return send(res, 404, { error: 'not found' });
  }
}).listen(port, () => console.log(`Beauty agent prototype: ${baseUrl}`));
