// PayPal sandbox. Deliberately no live-mode switch.
// Flow: the user approves once (vault). Later the agent authorizes at purchase time, runs a final check,
// then captures or voids. The store is the payee; our account never holds the user's money.
import { randomUUID } from 'node:crypto';

const PP = 'https://api-m.sandbox.paypal.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = null;

async function accessToken() {
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

export async function pp(apiPath, method = 'GET', body, requestId) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${PP}${apiPath}`, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', Prefer: 'return=representation',
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (res.ok) return data;
    if (res.status >= 500 && attempt < 3 && requestId) { await sleep(500 * attempt); continue; }
    const issue = data.details?.[0]?.issue;
    throw Object.assign(new Error(`PayPal ${res.status} ${data.name || ''}${issue ? ` (${issue})` : ''} debug_id=${data.debug_id || 'none'}`), { issue, status: res.status });
  }
}

function unit({ description, amount, customId, payeeEmail }) {
  return {
    description: description.slice(0, 127), custom_id: customId.slice(0, 127),
    amount: { currency_code: 'USD', value: amount.toFixed(2) },
    ...(payeeEmail ? { payee: { email_address: payeeEmail } } : {}),
  };
}
const authOf = (order) => order.purchase_units?.[0]?.payments?.authorizations?.[0] || null;

// One-time approval: the buyer approves the first purchase in PayPal, which also saves the method for the agent.
export async function createMandateOrder(purchase, baseUrl) {
  const order = await pp('/v2/checkout/orders', 'POST', {
    intent: 'AUTHORIZE', purchase_units: [unit(purchase)],
    payment_source: { paypal: {
      attributes: { vault: { store_in_vault: 'ON_SUCCESS', usage_type: 'MERCHANT', customer_type: 'CONSUMER' } },
      experience_context: { shipping_preference: 'NO_SHIPPING', user_action: 'CONTINUE', return_url: `${baseUrl}/paypal/return`, cancel_url: `${baseUrl}/paypal/cancel` },
    } },
  }, randomUUID());
  return { orderId: order.id, approveUrl: order.links?.find((l) => ['payer-action', 'approve'].includes(l.rel))?.href };
}

export async function authorizeApproved(orderId) {
  const order = await pp(`/v2/checkout/orders/${orderId}/authorize`, 'POST', {}, randomUUID());
  const auth = authOf(order);
  return { orderId, authId: auth?.id, authStatus: auth?.status, expires: auth?.expiration_time, vaultId: order.payment_source?.paypal?.attributes?.vault?.id || null };
}

// The agent's own purchase: authorize with the saved method, no checkout page.
export async function authorizeWithVault(vaultId, purchase) {
  const order = await pp('/v2/checkout/orders', 'POST', {
    intent: 'AUTHORIZE', purchase_units: [unit(purchase)], payment_source: { paypal: { vault_id: vaultId } },
  }, `auth-${purchase.customId}`.slice(0, 100));
  let auth = authOf(order);
  if (!auth) auth = authOf(await pp(`/v2/checkout/orders/${order.id}/authorize`, 'POST', {}, randomUUID()));
  return { orderId: order.id, authId: auth?.id, authStatus: auth?.status, expires: auth?.expiration_time };
}

export async function captureAuthorization(authId, amount) {
  const r = await pp(`/v2/payments/authorizations/${authId}/capture`, 'POST', {
    final_capture: true, ...(amount ? { amount: { currency_code: 'USD', value: amount.toFixed(2) } } : {}),
  }, randomUUID());
  return { captureId: r.id, status: r.status };
}

export async function voidAuthorization(authId) {
  await pp(`/v2/payments/authorizations/${authId}/void`, 'POST', {}, randomUUID());
  return { voided: true };
}

export async function refundCapture(captureId, note) {
  const r = await pp(`/v2/payments/captures/${captureId}/refund`, 'POST', { note_to_payer: note.slice(0, 255) }, randomUUID());
  return { refundId: r.id, status: r.status };
}

// Who received the money: read back the capture's payee from PayPal's own record.
export async function capturePayee(captureId) {
  const c = await pp(`/v2/payments/captures/${captureId}`);
  return { status: c.status, payee: c.payee?.email_address || c.payee?.merchant_id || null, amount: c.amount?.value };
}
