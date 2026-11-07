// PROTOTYPE ad deal desk server. No dependencies. Usage: node prototypes/ad-desk/server.mjs [port]
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizeApproved, byId, captureHold, checkPage, chooseWho, holdApproval, holdWithVault, MARKET, negotiate, payPublisher, priceView, publicPub, rankFit, simulateClicks, voidHold, writeAd } from './agent.mjs';
import { loadEnv } from '../costume-buyer/services.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(root, 'data', 'prototype-state-wipe-me.json');
const port = Number(process.argv[2]) || 8093;
const baseUrl = `http://localhost:${port}`;
const SPEND_CAP = 1; // USD of model calls per reset, so testing can't run away with the credit
await loadEnv(path.join(root, '..', '..', '.env.local'));

const addDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

function freshState() {
  return {
    day: today(), runs: 0, brief: { product: 'Stride merino running socks', audience: 'people training for a marathon', budget: 900, days: 3, url: 'https://example.com/stride-socks' },
    board: [], deals: [], memory: { deals: [] }, placements: {}, vaultId: null, pendingOrder: null, log: [], modelCost: 0, working: null,
  };
}
let state = await readFile(statePath, 'utf8').then(JSON.parse).catch(() => freshState());
state.working = null; // nothing survives a restart mid-run

const save = async () => {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 1));
  await rename(`${statePath}.tmp`, statePath);
};
const log = (kind, text) => state.log.unshift({ day: state.day, kind, text, at: Date.now() });
const charge = (c) => { state.modelCost += c || 0; if (state.modelCost >= SPEND_CAP) throw new Error(`AI spend cap of $${SPEND_CAP} reached. Start over to continue.`); };
const working = async (text) => { state.working = text; await save(); };
const committed = () => state.deals.filter((d) => ['agreed', 'held', 'waiting', 'fixing', 'paid'].includes(d.status)).reduce((n, d) => n + d.price, 0);

async function run(brief) {
  state.brief = { ...state.brief, ...brief, budget: Number(brief?.budget) || state.brief.budget, days: Number(brief?.days) || state.brief.days };
  state.runs += 1;
  state.deals = [];
  state.board = [];
  await working('Reading the market');
  const { scores, cost } = await rankFit(state.brief, state.memory);
  charge(cost);
  const { rows, talkTo } = chooseWho(scores, state.brief, state.memory);
  state.board = rows;
  const skipped = rows.filter((r) => r.verdict === 'skip').length;
  log('plan', `Skipping ${skipped} publishers and talking to ${talkTo.length}.`);
  await save();
  for (const id of talkTo) {
    const pub = byId(id), pv = priceView(pub, state.memory);
    const room = state.brief.budget - committed();
    if (room < pub.floor) { const r = rows.find((x) => x.id === id); r.verdict = 'skip'; r.why = 'The budget ran out first.'; continue; }
    const deal = { id: `d${state.runs}x${id.slice(0, 6)}`.replace(/[^a-z0-9]/gi, ''), pubId: id, status: 'talking', limit: Math.min(pv.limit, room), fair: pv.fair, ask: pub.ask, offer: 0, messages: [], usedMemory: pv.usedMemory };
    state.deals.push(deal);
    await working(`Negotiating with ${pub.name}`);
    await negotiate(deal, state.brief, pub, pv, async (c) => { charge(c); await save(); });
    log(deal.status === 'agreed' ? 'deal' : 'nodeal', deal.status === 'agreed' ? `${pub.name}: agreed $${deal.price}, down from $${pub.ask}.` : `${pub.name}: no deal.`);
  }
  await save();
}

function holdDone(deal, authId) {
  deal.status = 'held';
  deal.authId = authId;
  deal.deadline = addDays(state.day, state.brief.days);
  log('hold', `Holding $${deal.price} for ${byId(deal.pubId).name}. PayPal authorization ${authId}. Nothing has been taken yet.`);
}

// The first hold needs a person: approving it once in PayPal saves the method for the agent.
async function fund() {
  const agreed = state.deals.filter((d) => d.status === 'agreed');
  if (!agreed.length) return {};
  if (!state.vaultId) {
    const first = agreed[0];
    const { orderId, approveUrl } = await holdApproval(`Ad slot: ${byId(first.pubId).name}`, first.price, first.id, baseUrl);
    state.pendingOrder = { orderId, dealId: first.id };
    log('approve', 'Needs your one approval in PayPal.');
    return { approveUrl };
  }
  background(deliverAll);
  return {};
}

async function holdRest() {
  for (const deal of state.deals.filter((d) => d.status === 'agreed')) {
    await working(`Holding money for ${byId(deal.pubId).name}`);
    const { authId } = await holdWithVault(state.vaultId, `Ad slot: ${byId(deal.pubId).name}`, deal.price, deal.id);
    holdDone(deal, authId);
  }
}

// The publisher's agent places the ad, the way each demo publisher behaves.
function publish(deal, pub, fixed = false) {
  const url = `${state.brief.url}?ref=${deal.id}`;
  const labelled = pub.behavior !== 'hides_disclosure' || fixed;
  state.placements[pub.id] = { dealId: deal.id, url, ad: deal.ad, labelled };
}

async function settle(deal, pub) {
  await working(`Taking payment for ${pub.name}`);
  deal.captureId = await captureHold(deal.authId);
  deal.status = 'paid';
  log('paid', `Proof passed. Took $${deal.price}. PayPal capture ${deal.captureId}.`);
  try {
    deal.payoutId = await payPublisher(pub, deal.price, deal.id);
    log('paid', `Paid ${pub.name} $${deal.price}. PayPal payout ${deal.payoutId}.`);
  } catch (e) {
    deal.payoutError = e.message;
    log('error', `Couldn't pay ${pub.name}: ${e.message}`);
  }
  deal.clicks = simulateClicks(pub, deal);
  state.memory.deals.push({ pubId: pub.id, price: deal.price, clicks: deal.clicks, paid: true, outcome: deal.needed_fix ? 'needed_fix' : 'clean', day: state.day });
}

async function verify(deal) {
  const pub = byId(deal.pubId);
  await working(`Checking ${pub.name}'s page`);
  // A real request for the real page, so the check can't be talked around.
  const res = await fetch(`${baseUrl}/pub/${pub.id}`, { signal: AbortSignal.timeout(10_000) });
  const check = checkPage(await res.text(), deal);
  deal.check = check;
  deal.checkedOn = state.day;
  if (check.link && check.label) return settle(deal, pub);
  if (!deal.needed_fix) {
    deal.needed_fix = true;
    deal.status = 'fixing';
    log('fix', `${pub.name}: ${check.problem} I'm holding the money and asking them to fix it.`);
    await save();
    await working(`Waiting for ${pub.name} to fix the ad`);
    publish(deal, pub, true);
    return verify(deal);
  }
  log('fix', `${pub.name} still fails the check.`);
}

async function deliverAll() {
  if (state.pendingOrder) return;
  await holdRest();
  for (const deal of state.deals.filter((d) => d.status === 'held')) {
    const pub = byId(deal.pubId);
    await working(`Writing the ad for ${pub.name}`);
    const { ad, cost } = await writeAd(state.brief, pub);
    charge(cost);
    deal.ad = ad;
    if (pub.behavior === 'late') {
      deal.status = 'waiting';
      log('wait', `${pub.name} hasn't run the ad yet. Money stays held until ${deal.deadline}.`);
      await save();
      continue;
    }
    publish(deal, pub);
    await verify(deal);
    await save();
  }
}

// When a deadline passes with no ad, the hold is released and the agent remembers.
async function nextDay(days) {
  state.day = addDays(state.day, days);
  log('day', `It's ${state.day}.`);
  for (const deal of state.deals.filter((d) => d.status === 'waiting' && d.deadline < state.day)) {
    const pub = byId(deal.pubId);
    await working(`Releasing the hold for ${pub.name}`);
    await voidHold(deal.authId);
    deal.status = 'voided';
    state.memory.deals.push({ pubId: pub.id, price: deal.price, clicks: 0, paid: false, outcome: 'no_show', day: state.day });
    log('void', `${pub.name} missed the deadline. Released the $${deal.price} hold, and you paid nothing. I won't use them again.`);
  }
}

// ---------- Demo publisher sites: what the agent actually fetches. ----------
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function pubPage(pub) {
  const p = state.placements[pub.id];
  const slot = p ? `<aside style="margin:28px 0;padding:18px;border:2px solid ${pub.accent};border-radius:6px">
    ${p.labelled ? `<div style="font:700 12px system-ui;letter-spacing:.08em;color:${pub.accent}">SPONSORED</div>` : ''}
    <div style="font:700 22px Georgia,serif;margin:6px 0">${esc(p.ad?.headline)}</div><p style="margin:0 0 10px">${esc(p.ad?.line)}</p>
    <a href="${esc(p.url)}" style="color:${pub.accent};font-weight:700">See it here</a></aside>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(pub.name)}</title></head>
  <body style="margin:0;background:#fff;color:#222;font:18px/1.6 Georgia,serif">
  <div style="background:#222;color:#fff;font:13px system-ui;padding:6px 16px">Demo publisher for a prototype. Not a real ${esc(pub.kind.toLowerCase())}.</div>
  <header style="border-bottom:4px solid ${pub.accent};padding:20px 16px"><div style="max-width:680px;margin:auto;font:800 34px system-ui;color:${pub.accent}">${esc(pub.name)}</div></header>
  <main style="max-width:680px;margin:auto;padding:16px"><h1 style="font-size:30px;line-height:1.2">Five things that changed how I train</h1>
  <p>${esc(pub.about)}. This week we look at what actually helps in the long weeks before race day, from sleep to how you tie your shoes.</p>
  ${slot}<p>Most plans overrate the big sessions. The boring days are where the fitness shows up, and they're what most people skip first.</p></main></body></html>`;
}

// ---------- HTTP ----------
const view = () => ({ ...state, vaultId: undefined, hasPaypal: !!state.vaultId, market: MARKET.map((p) => ({ ...publicPub(p), price: priceView(p, state.memory) })), committed: committed() });
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
const bodyOf = async (req) => { let t = ''; for await (const c of req) t += c; return t ? JSON.parse(t) : {}; };

function background(fn) {
  state.working = 'Starting';
  fn().catch((e) => { console.error(e); log('error', e.message); state.lastError = e.message; }).finally(async () => { state.working = null; await save(); });
}

createServer(async (req, res) => {
  const url = new URL(req.url, baseUrl);
  if (url.pathname === '/') return send(res, 200, await readFile(path.join(root, 'index.html')), 'text/html; charset=utf-8');
  if (url.pathname === '/api/state') return send(res, 200, view());
  const pubMatch = url.pathname.match(/^\/pub\/([a-z-]+)$/);
  if (pubMatch && byId(pubMatch[1])) return send(res, 200, pubPage(byId(pubMatch[1])), 'text/html; charset=utf-8');
  if (url.pathname === '/paypal/return') {
    const pending = state.pendingOrder;
    if (pending && pending.orderId === url.searchParams.get('token')) {
      try {
        const { authId, vaultId } = await authorizeApproved(pending.orderId);
        state.vaultId = vaultId;
        state.pendingOrder = null;
        holdDone(state.deals.find((d) => d.id === pending.dealId), authId);
        log('approve', vaultId ? 'PayPal linked. The agent can hold money within your budget.' : 'Held, but PayPal returned no saved method.');
        background(deliverAll);
      } catch (e) { console.error(e); log('error', e.message); state.lastError = e.message; }
      await save();
    }
    res.writeHead(302, { location: '/' });
    return res.end();
  }
  if (url.pathname === '/paypal/cancel') {
    state.pendingOrder = null;
    log('approve', 'PayPal approval cancelled. Nothing was held.');
    await save();
    res.writeHead(302, { location: '/' });
    return res.end();
  }
  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  const body = await bodyOf(req).catch(() => ({}));
  if (state.working) return send(res, 409, { ...view(), error: 'The agent is still working' });
  state.lastError = null;
  switch (url.pathname) {
    case '/api/run': background(() => run(body)); return send(res, 200, view());
    case '/api/fund':
      try { const extra = await fund(); await save(); return send(res, 200, { ...view(), ...extra }); }
      catch (e) { console.error(e); log('error', e.message); return send(res, 502, { ...view(), error: e.message }); }
    case '/api/day': background(() => nextDay(Number(body.days) || 1)); return send(res, 200, view());
    case '/api/reset': state = freshState(); await save(); return send(res, 200, view());
    default: return send(res, 404, { error: 'not found' });
  }
}).listen(port, () => console.log(`Ad desk prototype: ${baseUrl}`));
