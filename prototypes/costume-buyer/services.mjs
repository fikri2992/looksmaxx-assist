// Outside services: env loading, Channel3 product data, OpenRouter models, Open-Meteo weather, PayPal sandbox.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export async function loadEnv(file) {
  const content = await readFile(file, 'utf8').catch((e) => { if (e.code === 'ENOENT') return ''; throw e; });
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Channel3 MCP (streamable HTTP, JSON-RPC) ----------
const C3_URL = 'https://mcp.trychannel3.com/';
let c3Session = null;
let c3Thread = null;
let rpcId = 1;

async function c3Post(body) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' };
  if (c3Session) headers['mcp-session-id'] = c3Session;
  if (process.env.CHANNEL3_API_KEY) headers['x-api-key'] = process.env.CHANNEL3_API_KEY;
  const res = await fetch(C3_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`Channel3 ${res.status}: ${text.slice(0, 160)}`), { status: res.status });
  const sid = res.headers.get('mcp-session-id');
  if (sid) c3Session = sid;
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  return line ? JSON.parse(line.slice(6)) : text ? JSON.parse(text) : null;
}

async function c3Init() {
  c3Session = null;
  await c3Post({ jsonrpc: '2.0', id: rpcId++, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'costume-buyer', version: '0.1' } } });
  await c3Post({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

async function c3Call(name, args) {
  if (!c3Session) await c3Init();
  const send = () => c3Post({ jsonrpc: '2.0', id: rpcId++, method: 'tools/call',
    params: { name, arguments: c3Thread ? { ...args, thread_id: c3Thread } : args } });
  let json;
  try { json = await send(); } catch (e) {
    if (e.status === 400 || e.status === 404) { await c3Init(); json = await send(); } else throw e;
  }
  if (json?.error) throw new Error(`Channel3 ${name}: ${json.error.message}`);
  const sc = json?.result?.structuredContent;
  if (sc?.thread_id) c3Thread = sc.thread_id;
  return sc;
}

export async function searchProducts(query) {
  const sc = await c3Call('search_products', { query });
  return (sc?.products || []).map((p) => ({
    id: p.id,
    title: p.title,
    brand: p.brands?.[0]?.name || null,
    image: (p.images || []).find((i) => i.is_main_image)?.url || p.images?.[0]?.url || null,
    offers: (p.offers || []).filter((o) => o.price?.price != null).map((o) => ({
      store: o.domain, price: o.price.price, was: o.price.compare_at_price ?? null,
      currency: o.price.currency, inStock: o.availability === 'InStock', condition: o.condition || 'new',
    })),
  }));
}

export async function priceHistory(productId) {
  const sc = await c3Call('get_price_history', { product_id: productId });
  return (sc?.history || []).map((h) => h.price).filter((p) => p != null);
}

// ---------- Reasoning model via OpenRouter ----------
export async function askJson(model, prompt, maxTokens = 2500) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY missing from .env.local');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${model} ${res.status}: ${String(body?.error?.message || '').slice(0, 160)}`);
  const text = body.choices?.[0]?.message?.content || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`${model} returned no JSON`);
  return { json: JSON.parse(m[0]), cost: Number(body.usage?.cost || 0) };
}

// ---------- Weather for the shoot day ----------
export async function shootWeather(lat, lon, date) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=16`
    + '&daily=apparent_temperature_max,precipitation_probability_max,uv_index_max,relative_humidity_2m_mean';
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const { daily } = await res.json();
  const i = daily.time.indexOf(date);
  if (i < 0) return null; // beyond the 16-day forecast
  return {
    date, feelsMax: daily.apparent_temperature_max[i], rainChance: daily.precipitation_probability_max[i],
    uvMax: daily.uv_index_max[i], humidity: daily.relative_humidity_2m_mean[i],
  };
}

// ---------- PayPal sandbox. Deliberately no live-mode switch. ----------
const PP = 'https://api-m.sandbox.paypal.com';
let token = null;

async function ppToken() {
  if (token && token.expires > Date.now()) return token.value;
  const { PAYPAL_SANDBOX_CLIENT_ID: id, PAYPAL_SANDBOX_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error('PayPal sandbox credentials missing from .env.local');
  const res = await fetch(`${PP}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth ${res.status}: ${data.error || 'failed'}`);
  token = { value: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
  return token.value;
}

async function pp(path, method = 'GET', body, requestId) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${PP}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await ppToken()}`, 'Content-Type': 'application/json', Prefer: 'return=representation',
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (res.ok) return data;
    if (res.status >= 500 && attempt < 3 && requestId) { await sleep(500 * attempt); continue; }
    const issue = data.details?.[0]?.issue;
    throw new Error(`PayPal ${res.status} ${data.name || ''}${issue ? ` (${issue})` : ''} debug_id=${data.debug_id || 'none'}`);
  }
}

const unit = (description, amount, customId) => ({
  description: description.slice(0, 127), custom_id: customId.slice(0, 127),
  amount: { currency_code: 'USD', value: amount.toFixed(2) },
});

// First purchase: the buyer approves in PayPal and that approval saves the payment method for the agent.
export async function createApprovalOrder(description, amount, customId, baseUrl) {
  const order = await pp('/v2/checkout/orders', 'POST', {
    intent: 'CAPTURE', purchase_units: [unit(description, amount, customId)],
    payment_source: { paypal: {
      attributes: { vault: { store_in_vault: 'ON_SUCCESS', usage_type: 'MERCHANT', customer_type: 'CONSUMER' } },
      experience_context: { shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', return_url: `${baseUrl}/paypal/return`, cancel_url: `${baseUrl}/paypal/cancel` },
    } },
  }, randomUUID());
  return { orderId: order.id, approveUrl: order.links?.find((l) => ['payer-action', 'approve'].includes(l.rel))?.href };
}

function captureOf(order) {
  const c = order.purchase_units?.[0]?.payments?.captures?.[0];
  return { orderId: order.id, status: order.status, captureId: c?.id || null, captureStatus: c?.status || null,
    vaultId: order.payment_source?.paypal?.attributes?.vault?.id || null };
}

export async function captureOrder(orderId) {
  return captureOf(await pp(`/v2/checkout/orders/${orderId}/capture`, 'POST', {}, randomUUID()));
}

// Later purchases: the agent pays with the saved method and no checkout page.
export async function payWithVault(vaultId, description, amount, customId) {
  const order = await pp('/v2/checkout/orders', 'POST', {
    intent: 'CAPTURE', purchase_units: [unit(description, amount, customId)],
    payment_source: { paypal: { vault_id: vaultId } },
  }, `buy-${customId}`.slice(0, 100));
  const done = captureOf(order);
  return done.captureId ? done : captureOrder(order.id);
}

export async function refundCapture(captureId, reason) {
  const refund = await pp(`/v2/payments/captures/${captureId}/refund`, 'POST', { note_to_payer: reason.slice(0, 255) }, randomUUID());
  return { refundId: refund.id, status: refund.status };
}
