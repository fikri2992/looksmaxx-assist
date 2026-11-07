// Video mode (MASK_BRANDS=1): every JSON response has real product names, brands, store names and package photos
// replaced with generic labels, so a screen recording shows no third-party trademarks. Display only: the database
// and every decision stay real. Item names the person typed are their own and are left alone.
import { watchlist } from './prices.mjs';

export const masking = () => process.env.MASK_BRANDS === '1';

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const escapeJson = (s) => JSON.stringify(s).slice(1, -1);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// title → label, plus brand and store words to blank out, built fresh from what the server knows.
async function dictionary(db) {
  const titles = new Map(), words = new Set(), stores = new Set();
  const label = (d) => `${cap(d.need?.type || 'product')} listing`;
  for (const d of db.decisions) {
    if (d.product?.title) titles.set(d.product.title, label(d));
    if (d.product?.brand) words.add(d.product.brand);
    if (d.product?.store) stores.add(d.product.store);
    for (const x of [...(d.alternatives || []), ...(d.rejected || [])]) if (x.title) titles.set(x.title, 'a similar listing');
  }
  for (const j of db.watchJobs) if (j.title && !titles.has(j.title)) titles.set(j.title, 'watched listing');
  for (const w of await watchlist().catch(() => [])) {
    if (w.title) titles.set(w.title, cap(w.query || 'product'));
    if (w.brand) words.add(w.brand);
  }
  return { titles, words: [...words].filter((w) => w.length > 2), stores: [...stores].filter(Boolean) };
}

export async function maskBrands(body, db) {
  if (!masking() || body == null || typeof body !== 'object') return body;
  const { titles, words, stores } = await dictionary(db);
  let json = JSON.stringify(body);
  // Package photos carry logos; drop product image URLs (our own item photos are ids, not URLs).
  json = json.replace(/"image":"https?:[^"]*"/g, '"image":null');
  for (const [t, l] of [...titles].sort((a, b) => b[0].length - a[0].length)) json = json.split(escapeJson(t)).join(escapeJson(l));
  for (const s of stores) json = json.split(`"store":${JSON.stringify(s)}`).join('"store":"online store"').split(escapeJson(s)).join('an online store');
  if (words.length) json = json.replace(new RegExp(`\\b(${words.map((w) => escapeRe(escapeJson(w))).join('|')})\\b`, 'gi'), 'a brand');
  return JSON.parse(json);
}
