import { useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Card, Empty, Screen, Section, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore, type CheckIn, type SkinTrait } from '@/lib/api';
import { pickPhoto } from '@/lib/photo';

const RANK = { none: 0, mild: 1, noticeable: 2 } as const;

export default function CheckInScreen() {
  const { state, act } = useStore();
  const [err, setErr] = useState<string | null>(null);
  const checkins = state?.checkins ?? [];
  const todayDone = checkins.some((c) => c.live && c.at.slice(0, 10) === new Date().toISOString().slice(0, 10));

  const take = async (source: 'camera' | 'library') => {
    setErr(null);
    try {
      const image = await pickPhoto(source, true);
      if (image) await act('Reading your check-in', '/api/checkin', { image });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Screen title="Check-in" kicker={todayDone ? 'Done for today' : 'Once a day'}>
      {err ? <Banner tone="veto" icon="camera-off" text={err} /> : null}
      <Card>
        <T variant="display">{todayDone ? 'Today is saved' : 'Today’s selfie'}</T>
        <T tone="textSecondary">Same spot, even light, no filter. The agent describes what it can see, so it picks things that suit how your skin is doing. It can’t diagnose anything.</T>
        <View style={{ gap: Spacing.two }}>
          <Button label={todayDone ? 'Take another' : 'Take today’s selfie'} icon="camera-front-variant" onPress={() => take('camera')} />
          <Button kind="quiet" label="Choose a photo" icon="image-outline" onPress={() => take('library')} />
        </View>
        <T variant="small" tone="textSecondary">Selfies go only to the vision model, never to product search, and only the text result is saved.</T>
      </Card>

      <Section title="Your timeline" hint="Real days and demo days are labelled separately, never blended.">
        {checkins.length ? checkins.map((c) => <Entry key={c.id} c={c} />)
          : <Empty icon="calendar-heart" title="Start your timeline" text="One check-in a day builds a record no store has. After a week, the agent can tell a real change from a bad photo." />}
      </Section>
    </Screen>
  );
}

function Entry({ c }: { c: CheckIn }) {
  const t = useTheme();
  const date = new Date(c.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  if (c.reading.usable === false) return <Card><T variant="medium">{date}</T><T tone="veto">{c.reading.photo_problem ?? 'Photo not usable'}</T></Card>;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        <T variant="medium" style={{ flex: 1 }}>{date}</T>
        <View style={{ borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: c.live ? t.accent : t.backgroundElement }}>
          <T variant="small" style={{ color: c.live ? t.onAccent : t.textSecondary }}>{c.live ? 'Live' : 'Demo data'}</T>
        </View>
      </View>
      {(c.reading.skin ?? []).map((s) => <TraitRow key={s.trait} s={s} />)}
      {c.reading.makeup?.wearing ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          {c.reading.makeup.steps.map((m, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 14, height: 14, borderRadius: 4, borderWidth: 1, borderColor: t.line, backgroundColor: /^#[0-9a-f]{6}$/i.test(m.color_hex ?? '') ? m.color_hex! : 'transparent' }} />
              <T variant="small">{`${m.step}: ${m.look}`}</T>
            </View>
          ))}
        </View>
      ) : null}
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
