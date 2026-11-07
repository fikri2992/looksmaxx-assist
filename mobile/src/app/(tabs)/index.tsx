import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Empty, plural, Screen, Section, Sparkline, Stamp, T, type IconName } from '@/components/ui';
import { Radius, Spacing, Type, type Verdict } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mediaUrl, useStore, type Decision } from '@/lib/api';

const ORDER: Record<Verdict, number> = { veto: 0, wait: 1, buy: 2, ask: 3 };

export default function Today() {
  const t = useTheme();
  const { state, weather, act } = useStore();
  const [goal, setGoal] = useState('Keep my daily skincare stocked, and a natural makeup look for work.');
  const today = weather?.[0];
  const decisions = state?.decisions ?? [];
  const recent = decisions.slice(0, 12);
  const count = (v: Verdict) => recent.filter((d) => d.verdict === v).length;
  const low = state?.items.filter((i) => i.daysLeft != null && i.daysLeft <= 14) ?? [];
  const lastSkin = state?.checkins.find((c) => c.reading.usable !== false);
  const worst = lastSkin?.reading.skin?.find((s) => s.level === 'noticeable') ?? lastSkin?.reading.skin?.find((s) => s.level === 'mild');
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <Screen title="Today" kicker={`${date} · ${state?.settings.location.label ?? ''}`}>
      {/* Refusals first: the agent earns trust by what it doesn't buy. */}
      <Card style={{ backgroundColor: t.text, borderColor: t.text }}>
        <T variant="small" style={{ color: t.background, opacity: 0.75 }}>Your agent, lately</T>
        <View style={styles.tally}>
          <Tally n={count('veto')} label="skipped" color={t.background} />
          <Tally n={count('wait')} label="waiting" color={t.background} />
          <Tally n={count('buy')} label="to buy" color={t.background} />
          <Tally n={recent.filter((d) => d.paypal?.status === 'captured').length} label="paid" color={t.background} />
        </View>
        <T variant="small" style={{ color: t.background, opacity: 0.75 }}>It checks what you own, your skin, today’s weather and its own price history before spending anything.</T>
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two, paddingVertical: Spacing.one }}>
        <Signal icon="white-balance-sunny" label="UV today" value={today ? String(Math.round(today.uvMax)) : '–'} note={today ? (today.uvMax >= 8 ? 'Very high' : today.uvMax >= 6 ? 'High' : 'Moderate') : 'loading'} />
        <Signal icon="water-percent" label="Humidity" value={today ? `${Math.round(today.humidity)}%` : '–'} note={today ? `Feels ${Math.round(today.feelsMax)}°` : ''} />
        <Signal icon="face-woman-outline" label="Skin" value={worst ? worst.trait : lastSkin ? 'Calm' : '–'} note={lastSkin ? (worst ? worst.level : 'last check-in') : 'no check-in yet'} />
        <Signal icon="timer-sand" label="Running low" value={String(low.length)} note={low[0]?.name ?? 'nothing soon'} />
      </ScrollView>

      <OutfitCard />

      <Section title="Ask your agent" hint="It plans from what you own, then checks real prices.">
        <Card>
          <TextInput value={goal} onChangeText={setGoal} multiline accessibilityLabel="What you need" placeholderTextColor={t.textSecondary}
            style={[styles.input, { color: t.text, backgroundColor: t.background, borderColor: t.line }]} />
          <Button label="Check for me" icon="magnify" onPress={() => act('Planning and checking prices', '/api/plan', { goal })} />
        </Card>
      </Section>

      <Section title="Decisions" hint="Every call shows its evidence. Nothing is charged until a final check passes.">
        {recent.length
          ? [...recent].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict]).map((d) => <DecisionCard key={d.id} d={d} />)
          : <Empty icon="shopping-outline" title="No decisions yet" text="Scan your shelf and take a check-in first, then ask your agent. It will often decide not to buy." />}
      </Section>
    </Screen>
  );
}

// Today's outfit from the closet: the agent prefers pieces you haven't worn lately, for today's weather.
function OutfitCard() {
  const t = useTheme();
  const { state, act } = useStore();
  const o = state?.outfit;
  const today = new Date().toISOString().slice(0, 10);
  const fresh = o && o.day === today;
  const pieces = fresh ? o.itemIds.map((id) => state?.items.find((i) => i.id === id)).filter(Boolean) : [];
  const closetSize = state?.items.filter((i) => i.category === 'wardrobe').length ?? 0;
  if (closetSize < 2) return null;
  return (
    <Section title="Today’s outfit" hint="From your own closet, for today’s weather.">
      <Card>
        {pieces.length ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
              {pieces.map((p) => p && (
                <View key={p.id} style={{ width: 96, gap: 4 }}>
                  {p.photoId ? <Image source={mediaUrl(p.photoId)} style={styles.piece} contentFit="cover" accessibilityLabel={p.name} />
                    : <View style={[styles.piece, { backgroundColor: t.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}><MaterialCommunityIcons name="hanger" size={28} color={t.textSecondary} /></View>}
                  <T variant="small" numberOfLines={2}>{p.name}</T>
                </View>
              ))}
            </ScrollView>
            <T variant="small" tone="textSecondary">{o?.reason}</T>
            <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
              <Button kind={o?.worn ? 'quiet' : 'primary'} icon="check" label={o?.worn ? 'Logged as worn' : 'I’m wearing this'} disabled={o?.worn} onPress={() => act('Logging', '/api/outfit/wear')} />
              <Button kind="quiet" icon="refresh" label="Another" onPress={() => act('Picking today’s outfit', '/api/outfit')} />
            </View>
          </>
        ) : (
          <>
            <T tone="textSecondary">{fresh && o?.reason ? o.reason : 'Let the agent pick from what you own.'}</T>
            <Button icon="hanger" label="Pick today’s outfit" onPress={() => act('Picking today’s outfit', '/api/outfit')} />
          </>
        )}
      </Card>
    </Section>
  );
}

function Tally({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1 }}>
      <T style={{ fontFamily: Type.display, fontSize: 34, lineHeight: 38, color }}>{n}</T>
      <T variant="small" style={{ color, opacity: 0.8 }}>{label}</T>
    </View>
  );
}

function Signal({ icon, label, value, note }: { icon: IconName; label: string; value: string; note: string }) {
  const t = useTheme();
  return (
    <View style={[styles.signal, { backgroundColor: t.surface, borderColor: t.line }]}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <MaterialCommunityIcons name={icon} size={16} color={t.accent} />
        <T variant="small" tone="textSecondary">{label}</T>
      </View>
      <T style={{ fontFamily: Type.display, fontSize: value.length > 6 ? 17 : 22, lineHeight: 28 }} numberOfLines={1}>{value}</T>
      <T variant="small" tone="textSecondary" numberOfLines={1}>{note}</T>
    </View>
  );
}

function DecisionCard({ d }: { d: Decision }) {
  const t = useTheme();
  const { state, act } = useStore();
  const top = d.reasons.find((r) => r.then === d.verdict) ?? d.reasons[0];
  // Offer a price watch (same default as the server: the 30-day low, or 10% off when already at the low).
  const low = typeof d.facts?.['price.low'] === 'number' ? d.facts['price.low'] : null;
  const target = d.product ? (low != null && low < d.product.price ? low : +(d.product.price * 0.9).toFixed(2)) : null;
  const canWatch = !d.paypal && d.product && (d.verdict === 'ask' || d.verdict === 'wait')
    && !state?.watchJobs.some((j) => j.decisionId === d.id || (j.productId === d.product?.id && !j.firedAt));
  const prices = d.history?.rows.map((r) => r.price) ?? [];
  const lo = prices.length ? Math.min(...prices) : null;
  const hi = prices.length ? Math.max(...prices) : null;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        <Stamp verdict={d.verdict} />
        <T variant="display" style={{ flex: 1 }} numberOfLines={1}>{d.need.need}</T>
      </View>
      {d.product ? (
        <View style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'center' }}>
          {d.product.image ? <Image source={d.product.image} style={[styles.thumb, { backgroundColor: '#fff' }]} contentFit="contain" accessibilityLabel={d.product.title} />
            : <View style={[styles.thumb, { backgroundColor: t.backgroundElement }]} />}
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="medium" numberOfLines={2}>{d.product.title}</T>
            <T variant="small" tone="textSecondary">{d.product.store}</T>
            <T variant="bold">${d.product.price.toFixed(2)}{d.product.was ? <T variant="small" tone="textSecondary">{`  says “was $${d.product.was}”`}</T> : null}</T>
          </View>
        </View>
      ) : d.note ? <T tone="textSecondary">{d.note}</T> : null}
      <T>{top?.because}</T>
      {/* Only reasons that agree with the final call; weaker rules that also fired would just confuse. */}
      {d.reasons.filter((r) => r !== top && r.then === d.verdict).length ? <T variant="small" tone="textSecondary">{d.reasons.filter((r) => r !== top && r.then === d.verdict).map((r) => r.because).join(' ')}</T> : null}
      {prices.length > 1 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
          <Sparkline values={prices} now={d.product?.price} />
          <T variant="small" tone="textSecondary" style={{ flex: 1 }}>{`${plural(prices.length, 'day')}, $${lo}–$${hi}\n${d.history?.source}${d.history?.ourDays ? `, ${plural(d.history.ourDays, 'day')} our own` : ''}`}</T>
        </View>
      ) : null}
      {d.substitutedFor ? <T variant="small" tone="veto">{`Swapped in an alternative: the first match ${d.substitutedFor.reason}.`}</T> : null}
      {d.trigger?.kind === 'watch' ? <T variant="small" tone="wait">{`Came back on its own: its price watch fired at $${d.trigger.price} (target $${d.trigger.target}), so it decided again.${d.trigger.simulated ? ' Demo: the price drop was simulated.' : ''}`}</T> : null}
      {d.paypal ? <PayPalTrail d={d} /> : null}
      {!d.paypal && d.verdict === 'buy' && d.product ? <Button kind="buy" icon="shield-check-outline" label={`Let the agent buy · $${d.product.price.toFixed(2)}`} onPress={() => act('Authorizing, re-checking, then paying', '/api/buy', { id: d.id })} /> : null}
      {!d.paypal && d.verdict === 'ask' && d.product ? <Button kind="quiet" icon="account-check-outline" label="Approve and buy" onPress={() => act('Authorizing, re-checking, then paying', '/api/buy', { id: d.id, override: true })} /> : null}
      {canWatch ? <Button kind="quiet" icon="bell-ring-outline" label={`Watch for $${target} instead`} onPress={() => act('Setting a price watch', '/api/watch', { id: d.id })} /> : null}
    </Card>
  );
}

// The money trail, step by step, straight from PayPal's responses.
function PayPalTrail({ d }: { d: Decision }) {
  const t = useTheme();
  const p = d.paypal!;
  const steps: { done: boolean; tone: Verdict; text: string }[] = [
    { done: !!p.authId, tone: 'ask', text: p.firstApproval ? 'You approved once in PayPal' : `Authorized $${(p.authorized ?? p.amount ?? 0).toFixed(2)}` },
    ...(d.finalCheck ? [{ done: true, tone: d.finalCheck.verdict === 'buy' ? 'buy' as const : 'veto' as const, text: `Final check: live price $${d.finalCheck.livePrice}, ${d.finalCheck.verdict === 'buy' ? 'still a buy' : d.finalCheck.reasons[0]?.because ?? 'failed'}` }] : []),
    p.status === 'voided' ? { done: true, tone: 'veto', text: 'Hold released. Nothing was charged.' }
      : p.status === 'refunded' ? { done: true, tone: 'wait', text: `Refunded $${p.amount}` }
      : { done: p.status === 'captured', tone: 'buy', text: `Paid $${p.amount} to ${p.payee ?? 'the store'}` },
  ];
  return (
    <View style={[styles.trail, { borderColor: t.line }]}>
      {steps.map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'center' }}>
          <MaterialCommunityIcons name={s.done ? 'check-circle' : 'circle-outline'} size={16} color={t[s.tone]} />
          <T variant="small" style={{ flex: 1 }}>{s.text}</T>
        </View>
      ))}
      <T variant="mono" tone="textSecondary">{[p.authId && `auth ${p.authId}`, p.captureId && `capture ${p.captureId}`].filter(Boolean).join(' · ')}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  tally: { flexDirection: 'row', gap: Spacing.two, marginVertical: Spacing.two },
  signal: { width: 138, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, padding: Spacing.two + 4, gap: 2 },
  input: { minHeight: 72, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two + 4, fontFamily: Type.body, fontSize: 16, textAlignVertical: 'top' },
  thumb: { width: 64, height: 64, borderRadius: Radius.md },
  piece: { width: 96, height: 128, borderRadius: Radius.md },
  trail: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: 6 },
});
