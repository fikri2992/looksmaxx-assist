// Channel3 MCP (streamable HTTP, JSON-RPC). Used as five layers: identify (text or image),
// details, similar products, price history, and recreating a look item by item.
const C3_URL = 'https://mcp.trychannel3.com/';
let session = null;
let thread = null;
let rpcId = 1;

async function post(body) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' };
  if (session) headers['mcp-session-id'] = session;
  if (process.env.CHANNEL3_API_KEY) headers['x-api-key'] = process.env.CHANNEL3_API_KEY;
  const res = await fetch(C3_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`Channel3 ${res.status}: ${text.slice(0, 160)}`), { status: res.status });
  const sid = res.headers.get('mcp-session-id');
  if (sid) session = sid;
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  return line ? JSON.parse(line.slice(6)) : text ? JSON.parse(text) : null;
}

async function init() {
  session = null;
  await post({ jsonrpc: '2.0', id: rpcId++, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'shelfie', version: '0.1' } } });
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

async function call(name, args) {
  if (!session) await init();
  const send = () => post({ jsonrpc: '2.0', id: rpcId++, method: 'tools/call', params: { name, arguments: thread ? { ...args, thread_id: thread } : args } });
  let json;
  try { json = await send(); } catch (e) {
    if (e.status === 400 || e.status === 404) { await init(); json = await send(); } else throw e;
  }
  if (json?.error) throw new Error(`Channel3 ${name}: ${json.error.message}`);
  const sc = json?.result?.structuredContent;
  if (sc?.thread_id) thread = sc.thread_id;
  return sc;
}

export const shapeProduct = (p) => ({
  id: p.id, title: p.title, brand: p.brands?.[0]?.name || null,
  image: (p.images || []).find((i) => i.is_main_image)?.url || p.images?.[0]?.url || null,
  rating: p.ratings ? { value: p.ratings.value, count: p.ratings.count } : null,
  offers: (p.offers || []).filter((o) => o.price?.price != null).map((o) => ({
    store: o.domain, price: o.price.price, was: o.price.compare_at_price ?? null,
    currency: o.price.currency, inStock: o.availability === 'InStock', condition: o.condition || 'new', url: o.url || null,
  })),
});

// Layer 1: identify, by words or by a product crop's public URL (never a face).
export async function searchProducts({ query, imageUrl } = {}) {
  const sc = await call('search_products', { ...(query ? { query } : {}), ...(imageUrl ? { image_url: imageUrl } : {}) });
  return (sc?.products || []).map(shapeProduct);
}
// Layer 2: details, such as variants and description.
export async function productDetails(productId) {
  const sc = await call('get_details', { product_id: productId });
  return sc?.product ? { ...shapeProduct(sc.product), description: sc.product.description || null, variants: sc.product.variants || [] } : sc;
}
// Layer 3: alternatives when the exact item fails a rule or a price check.
export async function similarProducts(productId) {
  const sc = await call('get_similar', { product_id: productId });
  return (sc?.products || []).map(shapeProduct);
}
// Layer 4: Channel3's own price history, a second opinion next to our log.
export async function priceHistory(productId) {
  const sc = await call('get_price_history', { product_id: productId });
  return (sc?.history || []).filter((h) => h.price != null).map((h) => ({ at: h.timestamp, price: h.price }));
}
