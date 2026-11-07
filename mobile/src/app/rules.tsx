import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Screen, Section, Stamp, T } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore, type PolicyVersion, type Rule } from '@/lib/api';

// Plain words for the rule language, so anyone can read what the agent will do.
const FACT_WORDS: Record<string, string> = {
  'user.avoidHit': 'it contains something you reacted to', 'need.ownedCovering': 'you already own something that covers it',
  'price.vsLow': 'price ÷ its recent low', 'price.days': 'days of price history', 'need.daysLeft': 'days until you run out',
  'product.price': 'price', 'product.wasPrice': 'the “was” price', 'product.title': 'the product name', 'product.inStock': 'in stock',
  'weather.uvMax': 'today’s UV', 'weather.humidity': 'humidity', 'budget.monthLeft': 'budget left this month', 'rules.askAbove': 'your per-item limit', 'price.high': 'its recent high',
};
const OP_WORDS: Record<string, string> = { lt: '<', lte: '≤', gt: '>', gte: '≥', eq: '=', is: 'is', contains: 'contains', notEmpty: '', empty: 'is empty', gtFact: '>', ltFact: '<' };

export default function Rules() {
  const t = useTheme();
  const { state, act } = useStore();
  const [say, setSay] = useState('');
  const versions = [...(state?.policyVersions ?? [])].reverse();

  return (
    <Screen title="Rules & memory" kicker={`Rules v${state?.policy.version ?? 1} · ${state?.policy.rules.length ?? 0} rules`} right={<Button kind="quiet" label="Close" onPress={() => router.back()} />}>
      <Section title="What it remembers about you" hint="Stable facts it uses in every decision. Remove anything wrong.">
        <Card>
          {state?.memories.length ? state.memories.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
              <T variant="small" style={{ flex: 1 }}>{m.text}</T>
              <T variant="small" tone="textSecondary">{m.kind}</T>
              <Button kind="quiet" label="Forget" onPress={() => act('Forgetting', '/api/memories', { id: m.id }, 'DELETE')} />
            </View>
          )) : <T tone="textSecondary">Nothing yet. Tell the agent your preferences, sizes and goals.</T>}
          {state?.reactions.map((r) => <T key={r.id} variant="small" tone="veto">{`${r.item}: ${r.note}. Avoids ${r.avoid.join(', ')}.`}</T>)}
        </Card>
      </Section>

      <Section title="Report a reaction" hint="A reaction becomes a rule, tested before it goes live.">
        <Card>
          <TextInput value={say} onChangeText={setSay} multiline placeholder="The vitamin C serum stung my cheek. My moisturizer is almost gone." placeholderTextColor={t.textSecondary}
            accessibilityLabel="Report a reaction" style={[styles.input, { color: t.text, backgroundColor: t.background, borderColor: t.line }]} />
          <Button label="Remember this" icon="brain" disabled={!say.trim()} onPress={async () => { await act('Remembering and writing a rule', '/api/remember', { text: say }); setSay(''); }} />
        </Card>
      </Section>

      <Section title="Money" hint="Sandbox: simulated money only.">
        <Card>
          <Row icon={state?.settings.hasPaypal ? 'check-circle' : 'circle-outline'} tone={state?.settings.hasPaypal ? 'buy' : 'ask'} text={state?.settings.hasPaypal ? 'PayPal linked. The agent can buy within your rules.' : 'Not linked yet. The first purchase asks you to approve once in PayPal.'} />
          <Row icon="cash-lock" tone="ask" text={`Buys alone under $${state?.settings.rules.askAbove ?? 40} an item and $${state?.settings.rules.monthlyBudget ?? 120} a month. Anything else, it asks.`} />
          <Row icon="store-check-outline" tone="ask" text="It authorizes at purchase time, re-checks the live price, then pays the store or releases the hold. Shelfie never holds your money." />
          {state?.settings.hasPaypal
            ? <Button kind="quiet" icon="link-variant-off" label="Revoke the agent’s PayPal access" onPress={() => act('Revoking', '/api/paypal/revoke')} />
            : <Button icon="shield-check-outline" label="Give your agent a PayPal mandate" onPress={() => act('Opening PayPal', '/api/paypal/mandate')} />}
          {!state?.settings.hasPaypal ? <T variant="small" tone="textSecondary">PayPal shows these limits when you approve. Approving buys nothing.</T> : null}
        </Card>
      </Section>

      <Section title="How its rules changed" hint="Each version only went live after its tests passed.">
        {versions.map((v) => <VersionCard key={v.version} v={v} rules={state?.policy.rules ?? []} />)}
      </Section>

      <Section title={`Current rules (v${state?.policy.version ?? 1})`}>
        <Card>{(state?.policy.rules ?? []).map((r) => <RuleRow key={r.id} r={r} />)}</Card>
      </Section>

      <Section title="Watch jobs" hint="When it decides to wait, it writes itself a job that fires when the price drops."
        action={state?.watchJobs.length ? <Button kind="quiet" label="Run now" onPress={() => act('Checking watched prices', '/api/watch/run')} /> : null}>
        {state?.watchJobs.length ? state.watchJobs.map((j) => (
          <Card key={j.id}>
            <T variant="medium" numberOfLines={2}>{j.title}</T>
            <T variant="small" tone="textSecondary">{`Fires at $${j.trigger.price} or less · checks every ${j.everyHours}h · ${j.createdBy === "you" ? "set by you" : "written by the agent"} ${new Date(j.createdAt).toLocaleDateString("en-GB")}`}</T>
            <T variant="small" tone={j.firedAt ? 'buy' : 'textSecondary'}>{j.firedAt ? `Fired ${new Date(j.firedAt).toLocaleString('en-GB')}${j.lastPrice != null ? ` at $${j.lastPrice}` : ''}, then decided again` : j.lastRun ? `Last checked ${new Date(j.lastRun).toLocaleString('en-GB')}${j.lastPrice != null ? `: $${j.lastPrice}` : ''}` : 'Not run yet'}</T>
            {/* Demo aid: stand in for a price drop. The follow-up decision is labelled simulated everywhere. */}
            {!j.firedAt ? <Button kind="quiet" icon="flask-outline" label={`Demo: simulate a drop to $${j.trigger.price}`} onPress={() => act('Simulating a price drop', '/api/watch/run', { simulate: { [j.id]: j.trigger.price } })} /> : null}
          </Card>
        )) : <Card><T tone="textSecondary">None yet. They appear when the agent decides to wait for a better price.</T></Card>}
      </Section>

      <Section title="Activity">
        <Card>{(state?.log ?? []).slice(0, 25).map((l) => (
          <View key={l.id} style={{ gap: 2 }}>
            <T variant="small" tone="textSecondary">{new Date(l.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</T>
            <T variant="small">{l.text}</T>
          </View>
        ))}</Card>
      </Section>
    </Screen>
  );
}

function Row({ icon, tone, text }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; tone: 'buy' | 'ask'; text: string }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', gap: Spacing.two }}><MaterialCommunityIcons name={icon} size={18} color={t[tone]} /><T variant="small" style={{ flex: 1 }}>{text}</T></View>;
}

function VersionCard({ v, rules }: { v: PolicyVersion; rules: Rule[] }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const passed = v.testResults?.filter((r) => r.pass).length;
  const failed = v.testResults?.filter((r) => !r.pass) ?? [];
  // What the agent actually wrote: the rule as data (never code that runs) and the tests it had to pass.
  const written = (v.diff?.added ?? []).map((id) => rules.find((r) => r.id === id)).filter((r): r is Rule => !!r);
  const canOpen = v.createdBy === 'agent' && (written.length > 0 || !!v.testResults?.length);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        <T variant="display" style={{ flex: 1 }}>{`v${v.version}`}</T>
        <T variant="small" tone={v.activatedAt ? 'buy' : 'veto'}>{v.activatedAt ? (v.createdBy === 'seed' ? 'Starting rules' : 'Live') : 'Rejected by its own tests'}</T>
      </View>
      <T variant="small">{v.reason}</T>
      {v.diff?.added.length ? <T variant="mono" tone="textSecondary">{`+ ${v.diff.added.join(', ')}`}</T> : null}
      {v.testResults ? <T variant="small" tone="textSecondary">{`${passed}/${v.testResults.length} tests passed`}</T> : <T variant="small" tone="textSecondary">{`${v.testCount} tests`}</T>}
      {failed.map((f) => <T key={f.name} variant="small" tone="veto">{`✗ ${f.name}: expected ${f.expect}, got ${f.got}`}</T>)}
      {v.errors?.map((e) => <T key={e} variant="small" tone="veto">{`✗ ${e}`}</T>)}
      {canOpen ? <Button kind="quiet" icon={open ? 'chevron-up' : 'code-json'} label={open ? 'Hide what it wrote' : 'See what it wrote'} onPress={() => setOpen(!open)} /> : null}
      {open ? (
        <View style={{ gap: Spacing.two }}>
          {written.map((r) => (
            <View key={r.id} style={[styles.code, { backgroundColor: t.backgroundElement }]} accessibilityLabel={`Rule ${r.id} as written by the agent`}>
              <T variant="mono" style={{ fontSize: 12.5 }}>{JSON.stringify({ id: r.id, when: r.when, then: r.then, because: r.because }, null, 2)}</T>
            </View>
          ))}
          {v.testResults?.map((x) => <T key={x.name} variant="small" tone={x.pass ? 'buy' : 'veto'}>{`${x.pass ? '✓' : '✗'} ${x.name}: expects ${x.expect}${x.pass ? '' : `, got ${x.got}`}`}</T>)}
        </View>
      ) : null}
    </Card>
  );
}

function RuleRow({ r }: { r: Rule }) {
  const when = r.when.map((c) => {
    const fact = FACT_WORDS[c.fact] ?? c.fact;
    if (c.op === 'is') return c.value ? fact : `not ${fact}`;
    if (c.op === 'notEmpty') return fact;
    const value = typeof c.value === 'string' && FACT_WORDS[c.value] ? FACT_WORDS[c.value] : String(c.value ?? '');
    return `${fact} ${OP_WORDS[c.op] ?? c.op} ${value}`.trim();
  }).join(' and ');
  return (
    <View style={{ gap: 4, paddingVertical: 4 }}>
      <Stamp verdict={r.then} />
      <T variant="small">{`When ${when}.`}</T>
      <T variant="small" tone="textSecondary">{r.because}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 80, borderWidth: 1, borderRadius: Radius.md, padding: 12, fontFamily: Type.body, fontSize: 16, textAlignVertical: 'top' },
  code: { borderRadius: Radius.md, padding: 12 },
});
