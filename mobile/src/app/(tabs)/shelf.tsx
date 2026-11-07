import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button, Card, Chip, Empty, Glyph, LifeBar, Screen, Section, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { CATEGORY_LABEL, useStore, type Category, type Item } from '@/lib/api';

const FILTERS: (Category | 'all')[] = ['all', 'skincare', 'makeup', 'wardrobe', 'other'];

export default function Shelf() {
  const { state } = useStore();
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const items = (state?.items ?? []).filter((i) => filter === 'all' || i.category === filter);
  const low = items.filter((i) => i.daysLeft != null && i.daysLeft <= 14);
  const rest = items.filter((i) => !low.includes(i));

  return (
    <Screen title="Shelf" kicker={`${state?.items.length ?? 0} things you own`}
      right={<Button label="Scan" icon="camera-outline" onPress={() => router.push('/scan')} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
        {FILTERS.map((f) => <Chip key={f} label={f === 'all' ? 'All' : CATEGORY_LABEL[f]} selected={filter === f} onPress={() => setFilter(f)} />)}
      </ScrollView>
      {!items.length ? (
        <Empty icon="camera-outline" title="Show the agent what you own" text="One photo of your shelf, makeup bag or wardrobe. It reads what it can and you confirm the list, so it never buys what you already have."
          action={<View style={{ flexDirection: 'row', gap: Spacing.two }}><Button label="Scan a photo" icon="camera-outline" onPress={() => router.push('/scan')} /><Button kind="quiet" label="Add by hand" onPress={() => router.push('/item')} /></View>} />
      ) : null}
      {low.length ? <Section title="Running low" hint="Estimated from when you opened it.">{low.map((i) => <ItemRow key={i.id} item={i} />)}</Section> : null}
      {rest.length ? (
        <Section title={filter === 'all' ? 'Everything' : CATEGORY_LABEL[filter]} action={<Button kind="quiet" label="Add" icon="plus" onPress={() => router.push('/item')} />}>
          {rest.map((i) => <ItemRow key={i.id} item={i} />)}
        </Section>
      ) : null}
    </Screen>
  );
}

function ItemRow({ item }: { item: Item }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/item', params: { id: item.id } })} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
        <Glyph category={item.category} />
        <View style={{ flex: 1, gap: 4 }}>
          <T variant="medium" numberOfLines={1}>{item.name}</T>
          <T variant="small" tone="textSecondary">{`${CATEGORY_LABEL[item.category]} · ${item.type}${item.color ? ` · ${item.color}` : ''} · ${item.source}`}</T>
          {item.category !== 'wardrobe' ? <LifeBar daysLeft={item.daysLeft} life={item.life} /> : null}
          {item.status !== 'active' ? <T variant="small" tone="wait">{item.status === 'low' ? 'You said it’s running low' : 'You said it’s finished'}</T> : null}
        </View>
      </Card>
    </Pressable>
  );
}
