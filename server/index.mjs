// Shelfie API server. No dependencies. Usage: node server/index.mjs [port]
// The phone app and the web ledger both talk to this. Secrets (PayPal, OpenRouter) stay here.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv, repoRoot } from './lib/env.mjs';
await loadEnv();
const { load, save, id, now, log, activePolicy, reset } = await import('./lib/store.mjs');
const engine = await import('./lib/engine.mjs');
const { createMandateOrder, authorizeApproved, captureAuthorization, voidAuthorization, refundCapture } = await import('./lib/paypal.mjs');
const { movers, historyFor, summarize, observatory } = await import('./lib/prices.mjs');
const { weatherToday } = await import('./lib/weather.mjs');
const { modelSpend } = await import('./lib/models.mjs');
const { runTests } = await import('./lib/policy.mjs');
const { converse, createLook } = await import('./lib/agent.mjs');
const { whatWorks } = await import('./lib/insights.mjs');
const { savePhoto, readPhoto } = await import('./lib/photos.mjs');
const { transcribe, speak, spentToday } = await import('./lib/openai.mjs');

const port = Number(process.argv[2]) || Number(process.env.PORT) || 8095;
const baseUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;
const db = await load();

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const bodyOf = async (req) => { let t = ''; for await (const c of req) t += c; return t ? JSON.parse(t) : {}; };
const withRunOut = (i) => ({ ...i, ...engine.runOut(i) });
const view = () => ({
  settings: { ...db.settings, vaultId: undefined, hasPaypal: !!db.settings.vaultId, storeAccount: !!process.env.STORE_SANDBOX_EMAIL },
  items: db.items.map(withRunOut), checkins: db.checkins.slice(0, 60), reactions: db.reactions, decisions: db.decisions.slice(0, 100),
  policy: activePolicy(), policyVersions: db.policies.map(({ rules, tests, ...p }) => ({ ...p, ruleCount: rules.length, testCount: tests.length })),
  watchJobs: db.watchJobs, log: db.log.slice(0, 80), shelfDrafts: db.shelfDrafts, modelSpend: modelSpend(),
  memories: db.memories, diary: db.diary.slice(0, 60), looks: db.looks.slice(0, 30), chat: db.chat.slice(-40),
  insights: whatWorks(db), outfit: db.outfit || null,
});
const withPhoto = async (fields) => {
  const { photo, ...rest } = fields || {};
  return photo ? { ...rest, photoId: await savePhoto(photo) } : rest;
};

// Long agent work runs one at a time.
let busy = null;
async function exclusive(res, label, fn) {
  if (busy) return send(res, 409, { error: `Busy: ${busy}` });
  busy = label;
  try { const extra = await fn(); await save(); send(res, 200, { ...view(), ...(extra || {}) }); }
  catch (e) { console.error(e); log('error', e.message); await save(); send(res, 502, { ...view(), error: e.message }); }
  finally { busy = null; }
}

const routes = {
  'GET /api/state': async (req, res) => send(res, 200, view()),
  'GET /api/health': async (req, res) => send(res, 200, { ok: true, busy, paypal: !!process.env.PAYPAL_SANDBOX_CLIENT_ID, store: !!process.env.STORE_SANDBOX_EMAIL, openrouter: !!process.env.OPENROUTER_API_KEY }),

  // ----- Items (CRUD across categories; category is a field, not a separate app) -----
  'POST /api/items': async (req, res, body) => { const item = { id: id('itm'), createdAt: now(), status: 'active', source: 'manual', wears: [], ...(await withPhoto(body.item)) }; db.items.push(item); log('memory', `Added ${item.name}.`); await save(); send(res, 200, view()); },
  'PATCH /api/items': async (req, res, body) => { const item = db.items.find((i) => i.id === body.id); if (!item) return send(res, 404, { error: 'no such item' }); Object.assign(item, await withPhoto(body.patch), { updatedAt: now() }); await save(); send(res, 200, view()); },
  'POST /api/items/wear': async (req, res, body) => { const item = db.items.find((i) => i.id === body.id); if (!item) return send(res, 404, { error: 'no such item' }); item.wears = [...(item.wears || []), body.date || now().slice(0, 10)]; await save(); send(res, 200, view()); },

  // ----- Skin diary and memory -----
  'POST /api/diary': async (req, res, body) => {
    const date = body.date || now().slice(0, 10);
    const entry = db.diary.find((d) => d.date === date) || (db.diary.unshift({ id: id('dia'), date }), db.diary[0]);
    Object.assign(entry, { am: body.am ?? entry.am ?? [], pm: body.pm ?? entry.pm ?? [], feel: body.feel ?? entry.feel ?? null, notes: body.notes ?? entry.notes ?? '', updatedAt: now() });
    db.diary.sort((a, b) => b.date.localeCompare(a.date));
    await save(); send(res, 200, view());
  },
  'DELETE /api/memories': async (req, res, body) => { db.memories = db.memories.filter((m) => m.id !== body.id); await save(); send(res, 200, view()); },

  // ----- The agent: text and voice -----
  'POST /api/agent': (req, res, body) => exclusive(res, 'Thinking', async () => converse(String(body.text || '').slice(0, 2000), db)),
  'POST /api/voice': (req, res, body) => exclusive(res, 'Listening', async () => {
    const audio = Buffer.from(String(body.audio || '').replace(/^data:[^;]+;base64,/, ''), 'base64');
    const heard = await transcribe(audio, body.mime || 'audio/m4a', Number(body.seconds) || 30);
    if (!heard.trim()) return { heard: '', reply: "I didn't catch that." };
    const r = await converse(heard, db, { voice: true });
    // Served as a file: data URIs aren't reliably playable on every platform.
    const audioUrl = `/photos/${await savePhoto(await speak(r.reply), 'mp3')}`;
    return { heard, ...r, audioUrl };
  }),
  'POST /api/import': (req, res, body) => exclusive(res, 'Reading your receipt', async () => {
    const { items, orderDate } = await engine.readReceipt(body.text || '');
    db.shelfDrafts = items.map((it) => ({ ...it, id: id('drf'), keep: it.confidence >= 0.6, opened: orderDate, source: 'receipt, you confirmed' }));
    log('import', `Read ${items.length} items from a pasted receipt. Nothing is saved until you confirm.`);
  }),
  'POST /api/outfit': (req, res) => exclusive(res, 'Picking today’s outfit', async () => {
    const weather = await weatherToday(db.settings.location.lat, db.settings.location.lon).then((w) => w[0]).catch(() => null);
    db.outfit = { day: now().slice(0, 10), weather, ...(await engine.outfitOfDay(db, weather)) };
  }),
  'POST /api/outfit/wear': async (req, res) => {
    for (const iid of db.outfit?.itemIds || []) { const i = db.items.find((x) => x.id === iid); if (i) i.wears = [...(i.wears || []), now().slice(0, 10)]; }
    if (db.outfit) db.outfit.worn = true;
    log('memory', 'Logged today’s outfit as worn.');
    await save(); send(res, 200, view());
  },
  'POST /api/looks': (req, res, body) => exclusive(res, 'Styling a look', async () => { await createLook(db, body.itemIds || [], body.note || ''); }),
  'GET /api/openai/spend': async (req, res) => send(res, 200, { today: await spentToday(), cap: Number(process.env.OPENAI_DAILY_CAP || 10) }),
  'DELETE /api/items': async (req, res, body) => { db.items = db.items.filter((i) => i.id !== body.id); await save(); send(res, 200, view()); },

  // ----- Earning context -----
  'POST /api/shelf': (req, res, body) => exclusive(res, 'Reading your shelf', async () => {
    const { items } = await engine.readShelf(body.image);
    db.shelfDrafts = items.map((it) => ({ ...it, id: id('drf'), keep: it.readable !== false && it.confidence >= 0.8 }));
    log('photo', `Read ${items.length} items from a photo. Nothing is saved until you confirm. The photo itself isn't kept.`);
  }),
  'POST /api/shelf/confirm': async (req, res, body) => {
    // Crops are cut on the phone from the model's boxes, so each item gets its own photo without the full shelf leaving the device twice.
    for (const d of db.shelfDrafts.filter((x) => (body.ids || []).includes(x.id))) {
      const photoId = body.crops?.[d.id] ? await savePhoto(body.crops[d.id]) : null;
      db.items.push({ id: id('itm'), createdAt: now(), status: 'active', source: d.source || 'photo, you confirmed', name: d.brand ? `${d.brand} ${d.name}` : d.name, brand: d.brand, category: d.category, type: d.type, color: d.color, opened: d.category === 'wardrobe' ? null : (d.opened || null), wears: [], photoId });
    }
    log('memory', `Saved ${(body.ids || []).length} items you confirmed.`);
    db.shelfDrafts = [];
    await save(); send(res, 200, view());
  },
  'POST /api/checkin': (req, res, body) => exclusive(res, 'Reading your check-in', async () => {
    const { reading } = await engine.readSkin(body.image);
    const prev = db.checkins.find((c) => c.reading?.usable !== false)?.reading;
    // Only seeded demo check-ins may carry a past date; live ones are always stamped now.
    const at = body.seeded && body.at ? new Date(body.at).toISOString() : now();
    const entry = { id: id('chk'), at, live: !body.seeded, reading, changes: engine.compareCheckins(prev, reading) };
    db.checkins.unshift(entry);
    db.checkins.sort((a, b) => b.at.localeCompare(a.at));
    log('photo', reading.usable === false ? `Check-in photo not usable: ${reading.photo_problem}` : `Check-in saved as text; the photo isn't kept.${entry.changes.length ? ` Changed: ${entry.changes.join('; ')}.` : ''}`);
  }),
  'POST /api/remember': (req, res, body) => exclusive(res, 'Remembering', async () => {
    const r = await engine.rememberText(body.text || '', db);
    for (const x of r.reactions || []) {
      const reaction = { id: id('rct'), at: now(), source: 'you said', ...x };
      db.reactions.push(reaction);
      await engine.proposeRule(reaction, db); // a reaction becomes a tested rule, or a rejected attempt on record
    }
    for (const i of db.items) { if ((r.low || []).includes(i.id)) i.status = 'low'; if ((r.finished || []).includes(i.id)) i.status = 'finished'; }
    log('memory', `Remembered: ${(r.reactions || []).map((x) => `${x.item} (${x.note})`).join('; ') || 'nothing new'}.`);
  }),

  // ----- Deciding -----
  'POST /api/plan': (req, res, body) => exclusive(res, 'Deciding what to buy', async () => {
    const { needs } = await engine.planNeeds(body.goal || 'Keep my daily routine stocked', db);
    for (const need of needs) {
      try {
        const d = await engine.decide(need, db);
        db.decisions.unshift(d);
        log(d.verdict, `${need.need}: ${d.reasons.map((r) => r.because).join(' ')}`, { decisionId: d.id });
        if (d.verdict === 'wait' && d.product) {
          // The agent writes itself a watch job; it fires later without being asked.
          db.watchJobs.push({ id: id('job'), createdAt: now(), createdBy: 'agent', decisionId: d.id, productId: d.product.id, title: d.product.title, trigger: { op: 'lte', price: d.facts['price.low'] }, everyHours: 24, lastRun: null, firedAt: null });
        }
      } catch (e) { log('error', `${need.need}: ${e.message}`); }
      await save();
    }
  }),
  'POST /api/buy': (req, res, body) => exclusive(res, 'Buying', async () => {
    const d = db.decisions.find((x) => x.id === body.id);
    if (!d || !d.product) throw new Error('no such decision');
    if (d.verdict !== 'buy' && !body.override) throw new Error(`The policy said ${d.verdict}; approve it first.`);
    if (!db.settings.vaultId) {
      const { orderId, approveUrl } = await createMandateOrder({ description: d.product.title, amount: d.product.price, customId: d.id, payeeEmail: process.env.STORE_SANDBOX_EMAIL }, baseUrl);
      db.settings.pendingOrder = { orderId, decisionId: d.id };
      log('approve', 'Needs your one approval in PayPal. After that, the agent can buy within your rules.');
      return { approveUrl };
    }
    await engine.execute(d, db);
  }),
  'POST /api/refund': (req, res, body) => exclusive(res, 'Refunding', async () => {
    const d = db.decisions.find((x) => x.id === body.id);
    if (!d?.paypal?.captureId) throw new Error('nothing captured to refund');
    const r = await refundCapture(d.paypal.captureId, body.reason || 'Returned');
    Object.assign(d.paypal, { refundId: r.refundId, refundedAt: now(), status: 'refunded' });
    log('refund', `Refunded $${d.paypal.amount} for ${d.product.title}. PayPal refund ${r.refundId}.`);
  }),
  'POST /api/watch/run': (req, res) => exclusive(res, 'Running watch jobs', async () => {
    for (const job of db.watchJobs.filter((j) => !j.firedAt)) {
      const { rows } = await historyFor(job.productId);
      const latest = rows.at(-1)?.price;
      job.lastRun = now();
      if (latest != null && latest <= job.trigger.price) { job.firedAt = now(); log('watch', `Watch job ${job.id} fired: ${job.title} is $${latest}, at or under $${job.trigger.price}.`); }
    }
  }),

  // ----- Evidence -----
  'GET /api/prices/movers': async (req, res) => send(res, 200, await movers()),
  'GET /api/prices/observatory': async (req, res) => send(res, 200, await observatory()),
  'GET /api/weather': async (req, res) => send(res, 200, await weatherToday(db.settings.location.lat, db.settings.location.lon)),
  'GET /api/policy/tests': async (req, res) => send(res, 200, runTests(activePolicy())),
  'POST /api/reset': async (req, res) => { reset(); await save(); send(res, 200, view()); },
};

// The exported web app (npm run build:web) is served from the same origin, so judges need one URL and no install.
const appDir = path.join(repoRoot, 'mobile', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.map': 'application/json' };
async function serveApp(res, pathname) {
  const file = path.normalize(path.join(appDir, decodeURIComponent(pathname)));
  if (!file.startsWith(appDir)) return send(res, 403, { error: 'forbidden' });
  const body = await readFile(file).catch(() => null);
  if (body && path.extname(file)) return send(res, 200, body, TYPES[path.extname(file)] || 'application/octet-stream');
  // Client-side routes fall back to the app shell.
  const shell = await readFile(path.join(appDir, 'index.html')).catch(() => null);
  return shell ? send(res, 200, shell, 'text/html; charset=utf-8') : send(res, 404, { error: 'Web app not built. Run: npm run build:web' });
}

createServer(async (req, res) => {
  const url = new URL(req.url, baseUrl);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (url.pathname === '/ledger') return send(res, 200, await readFile(path.join(repoRoot, 'web', 'ledger.html')).catch(() => 'ledger not built yet'), 'text/html; charset=utf-8');
  if (url.pathname.startsWith('/photos/')) {
    try { const name = url.pathname.split('/').pop(); return send(res, 200, await readPhoto(name), { png: 'image/png', mp3: 'audio/mpeg' }[name.split('.').pop()] || 'image/jpeg'); }
    catch { return send(res, 404, { error: 'no such photo' }); }
  }
  if (url.pathname.startsWith('/api/prices/history/')) {
    const h = await historyFor(decodeURIComponent(url.pathname.split('/').pop()));
    return send(res, 200, { ...h, summary: summarize(h.rows) });
  }
  if (url.pathname === '/paypal/return') {
    const pending = db.settings.pendingOrder;
    try {
      if (!pending || pending.orderId !== url.searchParams.get('token')) throw new Error('Unknown order returned from PayPal');
      const a = await authorizeApproved(pending.orderId);
      const d = db.decisions.find((x) => x.id === pending.decisionId);
      const cap = await captureAuthorization(a.authId);
      d.paypal = { orderId: a.orderId, authId: a.authId, captureId: cap.captureId, amount: d.product.price, status: 'captured', capturedAt: now(), payee: process.env.STORE_SANDBOX_EMAIL, firstApproval: true };
      db.settings.vaultId = a.vaultId;
      db.settings.pendingOrder = null;
      log('mandate', a.vaultId ? `PayPal linked. The agent can buy alone within $${db.settings.rules.askAbove} an item and $${db.settings.rules.monthlyBudget} a month.` : 'Paid, but PayPal returned no saved method.');
    } catch (e) { console.error(e); log('error', e.message); }
    await save();
    res.writeHead(302, { location: process.env.APP_RETURN_URL || '/ledger' });
    return res.end();
  }
  if (url.pathname === '/paypal/cancel') { db.settings.pendingOrder = null; log('approve', 'PayPal approval cancelled. Nothing was charged.'); await save(); res.writeHead(302, { location: '/ledger' }); return res.end(); }
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler && req.method === 'GET' && !url.pathname.startsWith('/api/')) return serveApp(res, url.pathname);
  if (!handler) return send(res, 404, { error: 'not found' });
  const body = req.method === 'GET' ? {} : await bodyOf(req).catch(() => ({}));
  try { await handler(req, res, body); } catch (e) { console.error(e); send(res, 500, { error: e.message }); }
}).listen(port, () => console.log(`Shelfie server: ${baseUrl}`));
