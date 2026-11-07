import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Chip, Empty, Glyph, plural, Screen, Section, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mediaUrl, useStore, type Item } from '@/lib/api';

export default function Closet() {
  const t = useTheme();
  const { state, act } = useStore();
  const [type, setType] = useState<string>('all');
  const [picking, setPicking] = useState<string[]>([]);
  const all = (state?.items ?? []).filter((i) => i.category === 'wardrobe');
  const types = ['all', ...new Set(all.map((i) => i.type))];
  const items = all.filter((i) => type === 'all' || i.type === type);
  const looks = state?.looks ?? [];
  const neverWorn = all.filter((i) => !(i.wears ?? []).length).length;
  // Same colour and type, many times over: the agent uses this to say "skip".
  const byKind = Object.entries(all.reduce<Record<string, number>>((a, i) => { const k = `${i.color ?? ''} ${i.type}`.trim(); a[k] = (a[k] ?? 0) + 1; return a; }, {})).filter(([, n]) => n >= 3);

  const toggle = (id: string) => setPicking((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Screen title="Closet" kicker={`${all.length} pieces · ${neverWorn} never worn`}
      right={<Button label="Add" icon="plus" onPress={() => router.push({ pathname: '/item', params: { category: 'wardrobe' } })} />}>
      {byKind.length ? (
        <View style={[styles.note, { backgroundColor: t.surface, borderColor: t.line }]}>
          <MaterialCommunityIcons name="information-outline" size={18} color={t.accent} />
          <T variant="small" style={{ flex: 1 }}>{`You own ${byKind.map(([k, n]) => `${n} ${k}s`).join(' and ')}. Your agent will skip more of those.`}</T>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
        {types.map((k) => <Chip key={k} label={k === 'all' ? 'All' : k} selected={type === k} onPress={() => setType(k)} />)}
      </ScrollView>

      {!all.length ? (
        <Empty icon="hanger" title="Your closet, one photo at a time" text="Add pieces with a photo, or scan a rail. Wear counts and colours let the agent stop you buying a fifth black top."
          action={<Button label="Scan a photo" icon="camera-outline" onPress={() => router.push('/scan')} />} />
      ) : (
        <>
          <View style={styles.grid}>
            {items.map((i) => <Piece key={i.id} item={i} picked={picking.includes(i.id)} onPress={() => (picking.length ? toggle(i.id) : router.push({ pathname: '/item', params: { id: i.id } }))} onLongPress={() => toggle(i.id)} />)}
          </View>
          <View style={{ gap: Spacing.two }}>
            {picking.length ? (
              <>
                <Button label={`Style these ${picking.length} into a look`} icon="auto-fix" onPress={async () => { await act('Styling a look', '/api/looks', { itemIds: picking }); setPicking([]); }} />
                <Button kind="quiet" label="Cancel" onPress={() => setPicking([])} />
              </>
            ) : <T variant="small" tone="textSecondary">Long-press pieces to pick them, then style a look.</T>}
          </View>
        </>
      )}

      {looks.length ? (
        <Section title="Looks" hint="Generated from your own pieces. Uses their photos when you’ve added them.">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
            {looks.map((l) => (
              <View key={l.id} style={{ gap: 4 }}>
                <Image source={mediaUrl(l.photoId)} style={styles.look} contentFit="cover" accessibilityLabel="Generated look" />
                <T variant="small" tone="textSecondary">{`${l.itemIds.length} pieces${l.fromPhotos ? ' · from your photos' : ''}`}</T>
              </View>
            ))}
          </ScrollView>
        </Section>
      ) : null}
    </Screen>
  );
}

function Piece({ item, picked, onPress, onLongPress }: { item: Item; picked: boolean; onPress: () => void; onLongPress: () => void }) {
  const t = useTheme();
  const { act } = useStore();
  const wears = item.wears?.length ?? 0;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={`${item.name}, worn ${plural(wears, 'time')}`} accessibilityState={{ selected: picked }}
      style={[styles.piece, { backgroundColor: t.surface, borderColor: picked ? t.accent : t.line, borderWidth: picked ? 2 : StyleSheet.hairlineWidth }]}>
      {item.photoId ? <Image source={mediaUrl(item.photoId)} style={styles.photo} contentFit="cover" accessibilityIgnoresInvertColors />
        : <View style={[styles.photo, { backgroundColor: t.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}><Glyph category="wardrobe" size={44} /></View>}
      <View style={{ padding: Spacing.two, gap: 2 }}>
        <T variant="medium" numberOfLines={1}>{item.name}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T variant="small" tone="textSecondary" style={{ flex: 1 }}>{wears ? `Worn ${wears}×` : 'Never worn'}</T>
          <Pressable onPress={() => act('Logging', '/api/items/wear', { id: item.id })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Wore ${item.name} today`}>
            <MaterialCommunityIcons name="check-circle-outline" size={20} color={t.accent} />
          </Pressable>
        </View>
      </View>
      {picked ? <View style={[styles.tick, { backgroundColor: t.accent }]}><MaterialCommunityIcons name="check" size={16} color={t.onAccent} /></View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  piece: { width: '48.5%', borderRadius: Radius.lg, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 3 / 4 },
  tick: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  look: { width: 180, height: 270, borderRadius: Radius.lg },
  note: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, padding: Spacing.two + 4 },
});
