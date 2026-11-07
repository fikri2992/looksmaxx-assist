import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Empty, LifeBar, Screen, Section, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore, type Item } from '@/lib/api';

// Common shade words to a swatch, for items without a stored hex.
const NAMED: Record<string, string> = { nude: '#C9A08A', brown: '#6B4A3A', black: '#1F1B18', red: '#B3262E', coral: '#E26D5A', pink: '#E59BB0', rose: '#C97B84', berry: '#7D2A47', peach: '#F2B48F', taupe: '#8F7C6E', gold: '#C9A24A', plum: '#6A3550' };
const hexFor = (i: Item) => (i.shade && /^#[0-9a-f]{6}$/i.test(i.shade) ? i.shade : NAMED[(i.color ?? '').toLowerCase()] ?? null);

export default function Makeup() {
  const t = useTheme();
  const { state } = useStore();
  const [type, setType] = useState('all');
  const all = (state?.items ?? []).filter((i) => i.category === 'makeup');
  const types = ['all', ...new Set(all.map((i) => i.type))];
  const items = all.filter((i) => type === 'all' || i.type === type);
  const seen = state?.checkins.find((c) => c.reading.makeup?.wearing)?.reading.makeup;

  return (
    <Screen title="Makeup" kicker={`${all.length} products`} right={<Button label="Add" icon="plus" onPress={() => router.push({ pathname: '/item', params: { category: 'makeup' } })} />}>
      {all.length ? (
        <View style={[styles.palette, { backgroundColor: t.surface, borderColor: t.line }]} accessibilityLabel="Your shades">
          {all.map((i) => <View key={i.id} style={[styles.swatch, { backgroundColor: hexFor(i) ?? t.backgroundElement, borderColor: t.line }]} />)}
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
        {types.map((k) => <Chip key={k} label={k === 'all' ? 'All' : k} selected={type === k} onPress={() => setType(k)} />)}
      </ScrollView>

      {!all.length ? <Empty icon="lipstick" title="Your makeup bag" text="Scan your makeup bag or add products by hand. Shades and open dates help the agent skip duplicates and tell you when mascara is past its best." action={<Button label="Scan a photo" icon="camera-outline" onPress={() => router.push('/scan')} />} />
        : items.map((i) => (
          <Pressable key={i.id} onPress={() => router.push({ pathname: '/item', params: { id: i.id } })} accessibilityRole="button" accessibilityLabel={`Edit ${i.name}`}>
            <Card style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'center' }}>
              <View style={[styles.bigSwatch, { backgroundColor: hexFor(i) ?? t.backgroundElement, borderColor: t.line }]} />
              <View style={{ flex: 1, gap: 4 }}>
                <T variant="medium" numberOfLines={1}>{i.name}</T>
                <T variant="small" tone="textSecondary">{[i.type, i.color, i.finish].filter(Boolean).join(' · ')}</T>
                <LifeBar daysLeft={i.daysLeft} life={i.life} />
              </View>
            </Card>
          </Pressable>
        ))}

      {seen?.steps.length ? (
        <Section title="Last look the agent saw" hint="From your latest check-in.">
          <Card>
            {seen.steps.map((s, k) => (
              <View key={k} style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'center' }}>
                <View style={[styles.dot, { backgroundColor: s.color_hex && /^#[0-9a-f]{6}$/i.test(s.color_hex) ? s.color_hex : t.backgroundElement, borderColor: t.line }]} />
                <T variant="small" style={{ flex: 1 }}>{`${s.step}: ${s.look}${s.finish ? `, ${s.finish}` : ''}`}</T>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: Spacing.two + 4, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1 },
  bigSwatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 1 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1 },
});
