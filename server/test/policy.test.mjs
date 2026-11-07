import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffPolicies, evaluate, runTests, SEED_POLICY, tryActivate, validatePolicy } from '../lib/policy.mjs';

const fair = { 'product.inStock': true, 'price.days': 30, 'price.low': 20, 'price.high': 24, 'price.vsLow': 1, 'need.ownedCovering': false, 'need.daysLeft': 4, 'user.avoidHit': '', 'budget.monthLeft': 100, 'rules.askAbove': 40, 'product.price': 20 };

test('the seed policy is valid and passes its own tests', () => {
  assert.deepEqual(validatePolicy(SEED_POLICY), []);
  for (const r of runTests(SEED_POLICY)) assert.ok(r.pass, `${r.name}: expected ${r.expect}, got ${r.got}`);
});

test('the strongest verdict wins and every fired rule is kept as evidence', () => {
  const r = evaluate(SEED_POLICY, { ...fair, 'user.avoidHit': 'fragrance' });
  assert.equal(r.verdict, 'veto');
  assert.ok(r.reasons.some((x) => x.rule === 'avoid-list'));
  assert.ok(r.reasons.some((x) => x.rule === 'fair-and-needed'), 'weaker rules still appear as evidence');
});

test('no matching rule means ask, never buy', () => {
  assert.equal(evaluate({ rules: [{ id: 'x', when: [{ fact: 'product.price', op: 'gt', value: 1000 }], then: 'buy', because: 'b' }] }, fair).verdict, 'ask');
});

test('rules may only read known facts with allowed operators', () => {
  const bad = { rules: [{ id: 'a', when: [{ fact: 'process.env', op: 'eq', value: 1 }], then: 'buy', because: 'b' }, { id: 'b', when: [{ fact: 'product.title', op: 'gt', value: 1 }], then: 'buy', because: 'b' }] };
  const errors = validatePolicy(bad);
  assert.ok(errors.some((e) => e.includes('unknown fact process.env')));
  assert.ok(errors.some((e) => e.includes('gt not allowed on text')));
});

test('a proposed version goes live only if old and new tests all pass', () => {
  const good = { ...SEED_POLICY, version: 2, rules: [...SEED_POLICY.rules, { id: 'no-vitc', when: [{ fact: 'product.title', op: 'contains', value: 'vitamin c' }], then: 'veto', because: 'Stung you.' }],
    tests: [{ name: 'vitamin c vetoed', facts: { ...fair, 'product.title': 'Vitamin C serum' }, expect: 'veto' }] };
  assert.equal(tryActivate(SEED_POLICY, good).ok, true);
  // A rule that would make every product a veto breaks an earlier test, so it must be rejected.
  const greedy = { ...SEED_POLICY, version: 3, rules: [...SEED_POLICY.rules, { id: 'veto-all', when: [{ fact: 'product.price', op: 'gte', value: 0 }], then: 'veto', because: 'x' }], tests: [] };
  const r = tryActivate(SEED_POLICY, greedy);
  assert.equal(r.ok, false);
  assert.ok(r.results.some((x) => !x.pass));
});

test('diff names added, removed and changed rules', () => {
  const b = { rules: [{ ...SEED_POLICY.rules[0], because: 'changed' }, ...SEED_POLICY.rules.slice(2), { id: 'new', when: [], then: 'ask', because: '' }] };
  const d = diffPolicies(SEED_POLICY, b);
  assert.deepEqual(d.added, ['new']);
  assert.deepEqual(d.removed, [SEED_POLICY.rules[1].id]);
  assert.deepEqual(d.changed, [SEED_POLICY.rules[0].id]);
});
