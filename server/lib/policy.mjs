// The agent's buying rules as data, not code. The agent may propose a new version with tests;
// it only goes live if it validates and every test (old and new) passes. Model-written code never runs.

// Facts the engine computes for a candidate purchase. Rules may only read these.
export const FACTS = {
  'product.title': 'text', 'product.brand': 'text', 'product.category': 'text', 'product.type': 'text',
  'product.price': 'number', 'product.wasPrice': 'number', 'product.inStock': 'boolean',
  'price.days': 'number', 'price.low': 'number', 'price.high': 'number', 'price.vsLow': 'number', // vsLow: price / recent low
  'need.ownedCovering': 'boolean', 'need.daysLeft': 'number',
  'user.avoidHit': 'text', // the avoid-list word found in the product, or ''
  'budget.monthLeft': 'number', 'rules.askAbove': 'number',
  'weather.uvMax': 'number', 'weather.humidity': 'number',
};
const OPS = { text: ['contains', 'eq', 'notEmpty', 'empty'], number: ['lt', 'lte', 'gt', 'gte', 'eq', 'gtFact', 'ltFact'], boolean: ['is'] };
export const VERDICTS = ['veto', 'ask', 'wait', 'buy'];
const STRENGTH = { veto: 4, ask: 3, wait: 2, buy: 1 };

export function validatePolicy(policy) {
  const errors = [];
  if (!Array.isArray(policy?.rules) || !policy.rules.length) errors.push('policy needs a non-empty rules list');
  const ids = new Set();
  for (const r of policy?.rules || []) {
    if (!r.id || ids.has(r.id)) errors.push(`rule id missing or repeated: ${r.id}`);
    ids.add(r.id);
    if (!VERDICTS.includes(r.then)) errors.push(`${r.id}: "then" must be one of ${VERDICTS.join(', ')}`);
    if (!r.because) errors.push(`${r.id}: needs a "because" sentence`);
    if (!Array.isArray(r.when) || !r.when.length) errors.push(`${r.id}: needs conditions`);
    for (const c of r.when || []) {
      const kind = FACTS[c.fact];
      if (!kind) { errors.push(`${r.id}: unknown fact ${c.fact}`); continue; }
      if (!OPS[kind].includes(c.op)) errors.push(`${r.id}: ${c.op} not allowed on ${kind} fact ${c.fact}`);
      if (['gtFact', 'ltFact'].includes(c.op) && FACTS[c.value] !== 'number') errors.push(`${r.id}: ${c.op} needs a number fact as value`);
    }
  }
  for (const t of policy?.tests || []) {
    if (!t.name || !VERDICTS.includes(t.expect)) errors.push(`test ${t.name || '?'}: needs a name and an expected verdict`);
    for (const k of Object.keys(t.facts || {})) if (!FACTS[k]) errors.push(`test ${t.name}: unknown fact ${k}`);
  }
  return errors;
}

// "Contains vitamin c" must not match "Vitamin C-free": the word counts only where it isn't followed by "free".
export function containsWord(text, word) {
  if (typeof text !== 'string' || !word) return false;
  const w = String(word).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${w}(?![- ]?free)`, 'i').test(text);
}

function holds(c, facts) {
  const v = facts[c.fact];
  switch (c.op) {
    case 'contains': return containsWord(v, c.value);
    case 'eq': return v === c.value;
    case 'notEmpty': return typeof v === 'string' && v.length > 0;
    case 'empty': return !v;
    case 'is': return v === c.value;
    case 'lt': return typeof v === 'number' && v < c.value;
    case 'lte': return typeof v === 'number' && v <= c.value;
    case 'gt': return typeof v === 'number' && v > c.value;
    case 'gte': return typeof v === 'number' && v >= c.value;
    case 'gtFact': return typeof v === 'number' && typeof facts[c.value] === 'number' && v > facts[c.value];
    case 'ltFact': return typeof v === 'number' && typeof facts[c.value] === 'number' && v < facts[c.value];
    default: return false;
  }
}

// Every matching rule counts; the strongest verdict wins, and all reasons are kept as evidence.
export function evaluate(policy, facts) {
  const fired = policy.rules.filter((r) => r.when.every((c) => holds(c, facts)));
  if (!fired.length) return { verdict: 'ask', reasons: [{ rule: 'no-rule', because: 'No rule covers this case, so I ask you.' }] };
  const top = Math.max(...fired.map((r) => STRENGTH[r.then]));
  return { verdict: VERDICTS.find((v) => STRENGTH[v] === top), reasons: fired.map((r) => ({ rule: r.id, then: r.then, because: r.because })) };
}

export function runTests(policy, tests = policy.tests || []) {
  return tests.map((t) => { const got = evaluate(policy, t.facts).verdict; return { name: t.name, expect: t.expect, got, pass: got === t.expect }; });
}

// A proposed version goes live only if it validates and passes its own tests plus all earlier ones.
export function tryActivate(current, proposed) {
  const errors = validatePolicy(proposed);
  if (errors.length) return { ok: false, errors, results: [] };
  const tests = [...(current?.tests || []), ...(proposed.tests || [])].filter((t, i, all) => all.findIndex((x) => x.name === t.name) === i);
  const results = runTests(proposed, tests);
  return { ok: results.every((r) => r.pass), errors: [], results, tests };
}

export function diffPolicies(a, b) {
  const before = new Map((a?.rules || []).map((r) => [r.id, JSON.stringify(r)]));
  const after = new Map((b?.rules || []).map((r) => [r.id, JSON.stringify(r)]));
  return {
    added: [...after.keys()].filter((k) => !before.has(k)),
    removed: [...before.keys()].filter((k) => !after.has(k)),
    changed: [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k)),
  };
}

const base = { 'product.inStock': true, 'price.days': 30, 'price.low': 20, 'price.high': 24, 'price.vsLow': 1, 'need.ownedCovering': false, 'need.daysLeft': 4, 'user.avoidHit': '', 'budget.monthLeft': 100, 'rules.askAbove': 40, 'product.price': 20 };

export const SEED_POLICY = {
  version: 1, createdBy: 'seed', reason: 'Starting rules',
  rules: [
    { id: 'avoid-list', when: [{ fact: 'user.avoidHit', op: 'notEmpty' }], then: 'veto', because: 'It contains something you reacted to before.' },
    { id: 'already-own', when: [{ fact: 'need.ownedCovering', op: 'is', value: true }], then: 'veto', because: 'You already own something that covers this.' },
    { id: 'too-cheap', when: [{ fact: 'price.vsLow', op: 'lt', value: 0.7 }], then: 'ask', because: 'Far below its own price history: likely a wrong match, a different size or a fake.' },
    { id: 'over-item-limit', when: [{ fact: 'product.price', op: 'gtFact', value: 'rules.askAbove' }], then: 'ask', because: 'Above your per-item limit.' },
    { id: 'over-budget', when: [{ fact: 'product.price', op: 'gtFact', value: 'budget.monthLeft' }], then: 'ask', because: 'Would pass your monthly budget.' },
    { id: 'thin-history', when: [{ fact: 'price.days', op: 'lt', value: 14 }], then: 'ask', because: 'Less than 14 days of prices, so I can’t judge the price.' },
    { id: 'fake-was-price', when: [{ fact: 'product.wasPrice', op: 'gtFact', value: 'price.high' }, { fact: 'price.days', op: 'gte', value: 14 }, { fact: 'need.daysLeft', op: 'gt', value: 7 }], then: 'wait', because: 'The “was” price never appeared in its history: the discount is fake, and you have time.' },
    { id: 'wait-for-low', when: [{ fact: 'price.vsLow', op: 'gt', value: 1.15 }, { fact: 'need.daysLeft', op: 'gt', value: 7 }], then: 'wait', because: 'It was clearly cheaper recently, and you have time before you run out.' },
    { id: 'fair-and-needed', when: [{ fact: 'price.vsLow', op: 'lte', value: 1.15 }, { fact: 'price.days', op: 'gte', value: 14 }, { fact: 'product.inStock', op: 'is', value: true }], then: 'buy', because: 'Fair against its own history, and you need it.' },
    { id: 'running-out', when: [{ fact: 'need.daysLeft', op: 'lte', value: 7 }, { fact: 'price.days', op: 'gte', value: 14 }, { fact: 'product.inStock', op: 'is', value: true }], then: 'buy', because: 'You run out within a week.' },
  ],
  tests: [
    { name: 'fair price, needed → buy', facts: { ...base }, expect: 'buy' },
    { name: 'avoid-list beats a good price', facts: { ...base, 'user.avoidHit': 'vitamin c' }, expect: 'veto' },
    { name: 'already own → veto', facts: { ...base, 'need.ownedCovering': true }, expect: 'veto' },
    { name: 'way below history → ask', facts: { ...base, 'product.price': 12, 'price.vsLow': 0.6 }, expect: 'ask' },
    { name: 'cheaper recently, time left → wait', facts: { ...base, 'product.price': 30, 'price.vsLow': 1.5, 'need.daysLeft': 30, 'price.high': 30 }, expect: 'wait' },
    { name: 'cheaper recently but running out → buy', facts: { ...base, 'product.price': 30, 'price.vsLow': 1.5, 'need.daysLeft': 3, 'price.high': 30 }, expect: 'buy' },
    { name: 'fake “was” price → wait', facts: { ...base, 'product.wasPrice': 48, 'need.daysLeft': 30 }, expect: 'wait' },
    { name: 'fake “was” price but running out, fair price → buy', facts: { ...base, 'product.wasPrice': 48, 'need.daysLeft': 3 }, expect: 'buy' },
    { name: 'thin history → ask', facts: { ...base, 'price.days': 5 }, expect: 'ask' },
    { name: 'over item limit → ask', facts: { ...base, 'product.price': 55, 'price.low': 50, 'price.high': 58 }, expect: 'ask' },
  ],
};
