// OpenAI: GPT-6 Luna for reasoning, vision and the agent; gpt-image for looks; transcription and speech for voice.
// Every call is priced conservatively and checked against a daily cap before it runs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from './env.mjs';

const API = 'https://api.openai.com/v1';
export const OPENAI = {
  chat: process.env.OPENAI_CHAT_MODEL || 'gpt-6-luna',
  image: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.6-flare',
  transcribe: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
  speech: process.env.OPENAI_SPEECH_MODEL || 'tts-1',
};
// Deliberately high per-unit estimates (USD), so the cap trips early rather than late.
const PRICE = { inPerM: 1.5, outPerM: 10, image: 0.3, transcribePerMin: 0.02, speechPerKChar: 0.03 };
const CAP = () => Number(process.env.OPENAI_DAILY_CAP || 10);

const ledgerFile = path.join(repoRoot, 'server', 'data', 'openai-spend.json');
const today = () => new Date().toISOString().slice(0, 10);
async function ledger() { return JSON.parse(await readFile(ledgerFile, 'utf8').catch(() => '{}')); }
export async function spentToday() { return (await ledger())[today()] || 0; }
// Charges run one at a time so concurrent calls can't overwrite each other's ledger update.
let chargeQueue = Promise.resolve();
const charge = (usd, what) => (chargeQueue = chargeQueue.then(() => writeCharge(usd, what), () => writeCharge(usd, what)));
async function writeCharge(usd, what) {
  const l = await ledger();
  l[today()] = +((l[today()] || 0) + usd).toFixed(5);
  await mkdir(path.dirname(ledgerFile), { recursive: true });
  await writeFile(ledgerFile, JSON.stringify(l, null, 1));
  if (process.env.DEBUG_SPEND) console.log(`openai ${what} ~$${usd.toFixed(4)} (today ~$${l[today()]})`);
}
async function guard(estimate) {
  const s = await spentToday();
  if (s + estimate > CAP()) throw new Error(`Today's OpenAI budget of $${CAP()} would be passed (about $${s.toFixed(2)} used). Try again tomorrow or raise OPENAI_DAILY_CAP.`);
}
const key = () => { if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing from .env.local'); return process.env.OPENAI_API_KEY; };

async function post(route, body, { form = false } = {}) {
  const res = await fetch(`${API}${route}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key()}`, ...(form ? {} : { 'content-type': 'application/json' }) },
    body: form ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(`OpenAI ${route} ${res.status}: ${String(j.error?.message || '').slice(0, 200)}`); }
  return res;
}

// Chat with optional tools. Returns the raw message so the agent loop can run tool calls.
export async function chat(messages, { tools, json = false, maxTokens = 4000 } = {}) {
  await guard(0.05);
  const res = await post('/chat/completions', {
    model: OPENAI.chat, messages, max_completion_tokens: maxTokens,
    // Chat Completions only allows function tools on Luna with reasoning off.
    ...(tools ? { tools, tool_choice: 'auto', reasoning_effort: 'none' } : {}), ...(json ? { response_format: { type: 'json_object' } } : {}),
  });
  const j = await res.json();
  const u = j.usage || {};
  const cost = ((u.prompt_tokens || 0) * PRICE.inPerM + (u.completion_tokens || 0) * PRICE.outPerM) / 1e6;
  await charge(cost, 'chat');
  return { message: j.choices[0].message, cost, finish: j.choices[0].finish_reason };
}

export async function chatJson(prompt, image, maxTokens = 4000) {
  const content = image ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }] : prompt;
  const { message, cost, finish } = await chat([{ role: 'user', content }], { json: true, maxTokens });
  const m = (message.content || '').match(/\{[\s\S]*\}/);
  try { if (!m) throw new Error('no JSON'); return { json: JSON.parse(m[0]), cost }; }
  catch (e) { throw Object.assign(new Error(`${OPENAI.chat} unreadable reply (${finish}): ${e.message}`), { cost }); }
}

// A look image. With reference photos it edits from them (your real items); otherwise it generates from words.
export async function makeImage(prompt, references = []) {
  await guard(PRICE.image);
  let res;
  if (references.length) {
    const form = new FormData();
    form.append('model', OPENAI.image);
    form.append('prompt', prompt);
    form.append('size', '1024x1536');
    form.append('output_format', 'jpeg');
    form.append('output_compression', '80');
    for (const [i, r] of references.slice(0, 6).entries()) form.append('image[]', new Blob([r.bytes], { type: r.type || 'image/jpeg' }), `ref-${i}.jpg`);
    res = await post('/images/edits', form, { form: true });
  } else {
    // JPEG keeps photos around 100 KB instead of 2 MB PNGs, which matters on phones.
    res = await post('/images/generations', { model: OPENAI.image, prompt, size: '1024x1536', output_format: 'jpeg', output_compression: 80 });
  }
  const j = await res.json();
  await charge(PRICE.image, 'image');
  return Buffer.from(j.data[0].b64_json, 'base64');
}

// GPT-Live voice session over WebRTC. The browser's SDP offer goes through here so the API key stays on the
// server. Delegation is "client": when the voice model needs to act, the page hands the turn to our own agent
// (same tools, memory and tested rules) and sends the result back to be spoken.
// Live is billed per second; we charge a conservative LIVE_MINUTES up front and the page ends the call there.
export const LIVE = { model: process.env.OPENAI_LIVE_MODEL || 'gpt-live-1', perMinute: 0.06, minutes: 5 };
// The API has no server-side hang-up, so the page ends each call; to bound what a misbehaving client can cost,
// only one call may start per LIVE.minutes window, the estimate is charged before the call opens, and
// LIVE_ENABLED=0 turns calls off (the public demo default).
let liveUntil = 0;
export async function createLiveSession(sdp, instructions) {
  if (process.env.LIVE_ENABLED === '0') throw new Error('Live calls are turned off on this server.');
  if (Date.now() < liveUntil) throw new Error('A live call is already running. Try again in a few minutes.');
  const estimate = LIVE.perMinute * LIVE.minutes;
  await guard(estimate);
  liveUntil = Date.now() + LIVE.minutes * 60_000;
  await charge(estimate, 'live');
  try {
    const res = await post('/live/sessions', {
      session: { model: LIVE.model, instructions, delegation: { type: 'client', acknowledgement_delay_ms: 800 } },
      transport: { type: 'webrtc', sdp },
    });
    const j = await res.json();
    return { id: j.session?.id, sdp: j.transport?.sdp, minutes: LIVE.minutes };
  } catch (e) { liveUntil = 0; throw e; }
}

export async function transcribe(bytes, type = 'audio/m4a', seconds = 30) {
  await guard((seconds / 60) * PRICE.transcribePerMin);
  const form = new FormData();
  form.append('model', OPENAI.transcribe);
  form.append('file', new Blob([bytes], { type }), `voice.${type.split('/')[1] || 'm4a'}`);
  const res = await post('/audio/transcriptions', form, { form: true });
  const j = await res.json();
  await charge((seconds / 60) * PRICE.transcribePerMin, 'transcribe');
  return j.text || '';
}

export async function speak(text, voice = 'shimmer') {
  const clipped = text.slice(0, 1200);
  await guard((clipped.length / 1000) * PRICE.speechPerKChar);
  const res = await post('/audio/speech', { model: OPENAI.speech, voice, input: clipped, response_format: 'mp3' });
  await charge((clipped.length / 1000) * PRICE.speechPerKChar, 'speech');
  return Buffer.from(await res.arrayBuffer());
}
