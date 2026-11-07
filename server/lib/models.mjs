// One entry point for "ask a model for JSON". GPT-6 Luna on OpenAI when a key is set; OpenRouter otherwise.
// Models read photos and write text; they never decide money.
import { chatJson } from './openai.mjs';

export const MODELS = { vision: 'google/gemini-3.8-flash', plan: 'google/gemini-3.8-flash', vet: 'openai/gpt-6-luna' };
const useOpenAI = () => !!process.env.OPENAI_API_KEY && process.env.MODEL_PROVIDER !== 'openrouter';

let spent = 0;
export const modelSpend = () => spent;
const CAP = Number(process.env.MODEL_SPEND_CAP || 2); // OpenRouter USD per server run

async function openrouter(model, content, maxTokens) {
  if (spent >= CAP) throw new Error(`Model spend cap of $${CAP} reached for this run.`);
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY missing from .env.local');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, max_tokens: maxTokens, response_format: { type: 'json_object' }, usage: { include: true }, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${model} ${res.status}: ${String(body?.error?.message || '').slice(0, 160)}`);
  const cost = Number(body.usage?.cost || 0);
  spent += cost;
  const text = body.choices?.[0]?.message?.content || '';
  const m = text.match(/\{[\s\S]*\}/);
  try { if (!m) throw new Error('no JSON'); return { json: JSON.parse(m[0]), cost }; }
  catch (e) { throw Object.assign(new Error(`${model} unreadable reply (${body.choices?.[0]?.finish_reason}): ${e.message}`), { cost }); }
}

// Thinking counts towards the token limit, so the limits are generous: 3000 cut replies off in testing.
export async function askJson(model, prompt, maxTokens = 8000) {
  if (useOpenAI()) { const r = await chatJson(prompt, null, maxTokens); spent += r.cost; return r; }
  return openrouter(model, prompt, maxTokens);
}
export async function askVision(model, prompt, image, maxTokens = 10_000) {
  if (useOpenAI()) { const r = await chatJson(prompt, image, maxTokens); spent += r.cost; return r; }
  return openrouter(model, [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }], maxTokens);
}
