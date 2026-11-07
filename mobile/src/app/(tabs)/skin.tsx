import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Banner, Button, Card, Chip, Empty, Glyph, LifeBar, UseBy, plural, Screen, Section, T } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore, type CheckIn, type Item, type SkinTrait } from '@/lib/api';
import { pickPhoto } from '@/lib/photo';

const RANK = { none: 0, mild: 1, noticeable: 2 } as const;
const FEELS = ['Calm', 'Tight', 'Oily', 'Itchy', 'Breakout', 'Glowing'];
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Skin() {
  const t = useTheme();
  const { state, act } = useStore();
  const [err, setErr] = useState<string | null>(null);
  const products = (state?.items ?? []).filter((i) => i.category === 'skincare');
  const checkins = state?.checkins ?? [];
  const entry = state?.diary.find((d) => d.date === todayIso());
  const [am, setAm] = useState<string[]>([]);
  const [pm, setPm] = useState<string[]>([]);
  const [feel, setFeel] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  // When today's saved entry changes (saved here or by the agent), reload the form from it during render.
  const entryKey = entry ? `${entry.id}:${entry.am?.length}:${entry.pm?.length}` : '';
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (loadedKey !== entryKey) {
    setLoadedKey(entryKey);
    setAm(entry?.am ?? []); setPm(entry?.pm ?? []); setFeel(entry?.feel ?? null); setNotes(entry?.notes ?? '');
  }
  const todayDone = checkins.some((c) => c.live && c.at.slice(0, 10) === todayIso());

  const take = async (source: 'camera' | 'library') => {
    setErr(null);
    try { const image = await pickPhoto(source, true); if (image) await act('Reading your check-in', '/api/checkin', { image }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const flip = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Screen title="Skin" kicker={todayDone ? 'Checked in today' : 'Diary and check-ins'}>
      {err ? <Banner tone="veto" icon="camera-off" text={err} /> : null}
      <Card>
        <T variant="display">{todayDone ? 'Today’s check-in is saved' : 'Today’s check-in'}</T>
        <T tone="textSecondary">Same spot, even light, no filter. The agent describes what it sees, so it picks things that suit how your skin is doing. It can’t diagnose anything.</T>
        <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
          <Button label={todayDone ? 'Take another' : 'Take a selfie'} icon="camera-front-variant" onPress={() => take('camera')} />
          <Button kind="quiet" label="Choose a photo" icon="image-outline" onPress={() => take('library')} />
        </View>
        <T variant="small" tone="textSecondary">Selfies go only to the vision model, never to product search. Only the text reading is saved.</T>
      </Card>

      <Section title="Today’s diary" hint="What you used and how your skin feels. This becomes evidence for what works on you.">
        <Card style={{ gap: Spacing.three }}>
          {products.length ? (
            <>
              <Routine label="Morning" products={products} picked={am} onToggle={(id) => flip(am, setAm, id)} />
              <Routine label="Evening" products={products} picked={pm} onToggle={(id) => flip(pm, setPm, id)} />
            </>
          ) : <T tone="textSecondary">Add your skincare products first, then tick what you used.</T>}
          <View style={{ gap: 6 }}>
            <T variant="small" tone="textSecondary">Skin feels</T>
            <View style={styles.wrap}>{FEELS.map((f) => <Chip key={f} label={f} selected={feel === f} onPress={() => setFeel(feel === f ? null : f)} />)}</View>
          </View>
          <TextInput value={notes} onChangeText={setNotes} placeholder="Anything else? New product, stress, bad sleep…" placeholderTextColor={t.textSecondary} multiline accessibilityLabel="Diary notes"
            style={[styles.input, { color: t.text, backgroundColor: t.background, borderColor: t.line }]} />
          <Button label={entry ? 'Update diary' : 'Save today'} icon="notebook-check-outline" onPress={() => act('Saving your diary', '/api/diary', { am, pm, feel, notes })} />
        </Card>
      </Section>

      <Section title="What works on you" hint={state?.insights ? `${state.insights.note} Based on ${plural(state.insights.days, 'day')}.` : 'Builds up from your diary and check-ins.'}>
        <Card>
          {state?.insights?.results.length ? state.insights.results.map((r) => {
            const tone = r.verdict === 'seems to help' ? 'buy' : r.verdict === 'seems to hurt' ? 'veto' : 'textSecondary';
            return (
              <View key={r.itemId} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }} accessibilityLabel={`${r.name}: ${r.verdict}`}>
                <View style={{ flex: 1 }}>
                  <T variant="medium" numberOfLines={1}>{r.name}</T>
                  <T variant="small" tone="textSecondary">{`Used ${plural(r.usedDays, 'day')}, not used ${r.otherDays}`}</T>
                </View>
                <T variant="bold" tone={tone} style={{ fontSize: 14 }}>{r.verdict}</T>
              </View>
            );
          }) : <T tone="textSecondary">Tick what you use each day and how your skin feels. After about a week, this shows which products seem to help and which seem to hurt.</T>}
        </Card>
      </Section>

      <Section title="Products" action={<Button kind="quiet" label="Add" icon="plus" onPress={() => router.push({ pathname: '/item', params: { category: 'skincare' } })} />}>
        {products.length ? products.map((p) => (
          <Pressable key={p.id} onPress={() => router.push({ pathname: '/item', params: { id: p.id } })} accessibilityRole="button">
            <Card style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'center' }}>
              <Glyph category="skincare" />
              <View style={{ flex: 1, gap: 4 }}>
                <T variant="medium" numberOfLines={1}>{p.name}</T>
                <LifeBar daysLeft={p.daysLeft} life={p.life} />
                <UseBy a={p.afterOpening} />
              </View>
            </Card>
          </Pressable>
        )) : <Empty icon="water-outline" title="No products yet" text="Scan your shelf or add them by hand." action={<Button label="Scan a photo" icon="camera-outline" onPress={() => router.push('/scan')} />} />}
      </Section>

      <Section title="Timeline" hint="Real days and demo days are labelled, never blended.">
        {checkins.length ? checkins.map((c) => <Entry key={c.id} c={c} diary={state?.diary.find((d) => d.date === c.at.slice(0, 10))?.feel} />)
          : <T tone="textSecondary">Your first check-in starts the timeline.</T>}
      </Section>
    </Screen>
  );
}

function Routine({ label, products, picked, onToggle }: { label: string; products: Item[]; picked: string[]; onToggle: (id: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <T variant="small" tone="textSecondary">{label}</T>
      <View style={styles.wrap}>{products.map((p) => <Chip key={p.id} label={p.name} selected={picked.includes(p.id)} onPress={() => onToggle(p.id)} />)}</View>
    </View>
  );
}

function Entry({ c, diary }: { c: CheckIn; diary?: string | null }) {
  const t = useTheme();
  const date = new Date(c.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  if (c.reading.usable === false) return <Card><T variant="medium">{date}</T><T tone="veto">{c.reading.photo_problem ?? 'Photo not usable'}</T></Card>;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        <T variant="medium" style={{ flex: 1 }}>{date}{diary ? <T variant="small" tone="textSecondary">{`  · felt ${diary.toLowerCase()}`}</T> : null}</T>
        <View style={{ borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: c.live ? t.accent : t.backgroundElement }}>
          <T variant="small" style={{ color: c.live ? t.onAccent : t.textSecondary }}>{c.live ? 'Live' : 'Demo data'}</T>
        </View>
      </View>
      {(c.reading.skin ?? []).map((s) => <TraitRow key={s.trait} s={s} />)}
      {c.changes.length ? <T variant="small" tone="wait">{`Changed since last time: ${c.changes.join('; ')}. Lighting can do this too.`}</T> : null}
    </Card>
  );
}

function TraitRow({ s }: { s: SkinTrait }) {
  const t = useTheme();
  const r = RANK[s.level] ?? 0;
  const tone = [t.buy, t.wait, t.veto][r];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }} accessibilityLabel={`${s.trait}: ${s.level}`}>
      <T variant="small" style={{ width: 130 }}>{s.trait}</T>
      <View style={{ flexDirection: 'row', gap: 3 }}>{[0, 1, 2].map((i) => <View key={i} style={{ width: 18, height: 6, borderRadius: 3, backgroundColor: i <= r ? tone : t.backgroundElement }} />)}</View>
      <T variant="small" tone="textSecondary" numberOfLines={1} style={{ flex: 1 }}>{s.level}{s.where ? ` · ${s.where}` : ''}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  input: { minHeight: 64, borderWidth: 1, borderRadius: Radius.md, padding: 12, fontFamily: Type.body, fontSize: 16, textAlignVertical: 'top' },
});
