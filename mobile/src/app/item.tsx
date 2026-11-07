import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Chip, Screen, T } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORY_LABEL, useStore, type Category, type Item } from '@/lib/api';

const CATS: Category[] = ['skincare', 'makeup', 'wardrobe', 'other'];
const STATUS: Item['status'][] = ['active', 'low', 'finished'];
const STATUS_LABEL = { active: 'In use', low: 'Running low', finished: 'Finished' };

export default function ItemScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, act } = useStore();
  const existing = state?.items.find((i) => i.id === id);
  const [form, setForm] = useState({
    name: existing?.name ?? '', brand: existing?.brand ?? '', category: existing?.category ?? 'skincare' as Category,
    type: existing?.type ?? '', color: existing?.color ?? '', opened: existing?.opened ?? '', status: existing?.status ?? 'active' as Item['status'],
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const validDate = !form.opened || /^\d{4}-\d{2}-\d{2}$/.test(form.opened);

  const save = async () => {
    const item = { ...form, brand: form.brand || null, color: form.color || null, opened: form.opened || null };
    await (existing ? act('Saving', '/api/items', { id: existing.id, patch: item }, 'PATCH') : act('Saving', '/api/items', { item }));
    router.back();
  };

  const field = (label: string, key: keyof typeof form, placeholder: string) => (
    <View style={{ gap: 6 }}>
      <T variant="small" tone="textSecondary">{label}</T>
      <TextInput value={form[key]} onChangeText={set(key)} placeholder={placeholder} placeholderTextColor={t.textSecondary} accessibilityLabel={label}
        style={[styles.input, { color: t.text, backgroundColor: t.background, borderColor: t.line }]} />
    </View>
  );

  return (
    <Screen title={existing ? 'Edit' : 'Add'} kicker={existing ? existing.source : 'Add by hand'} right={<Button kind="quiet" label="Close" onPress={() => router.back()} />}>
      <Card style={{ gap: Spacing.three }}>
        {field('Name', 'name', 'Gentle gel cleanser')}
        {field('Brand (optional)', 'brand', '')}
        <View style={{ gap: 6 }}>
          <T variant="small" tone="textSecondary">Category</T>
          <View style={styles.row}>{CATS.map((c) => <Chip key={c} label={CATEGORY_LABEL[c]} selected={form.category === c} onPress={() => set('category')(c)} />)}</View>
        </View>
        {field('Type', 'type', form.category === 'wardrobe' ? 'top, dress, shoes…' : 'cleanser, sunscreen, lipstick…')}
        {form.category === 'wardrobe' || form.category === 'makeup' ? field('Colour (optional)', 'color', 'black, nude, coral…') : null}
        {form.category !== 'wardrobe' ? field('Opened on (YYYY-MM-DD)', 'opened', '2026-10-20') : null}
        {!validDate ? <T variant="small" tone="veto">Use the format 2026-10-20.</T> : null}
        <View style={{ gap: 6 }}>
          <T variant="small" tone="textSecondary">Status</T>
          <View style={styles.row}>{STATUS.map((s) => <Chip key={s} label={STATUS_LABEL[s]} selected={form.status === s} onPress={() => set('status')(s)} />)}</View>
        </View>
        <Button label="Save" icon="check" disabled={!form.name || !form.type || !validDate} onPress={save} />
        {existing ? <Button kind="quiet" label="Delete" icon="trash-can-outline" onPress={async () => { await act('Deleting', '/api/items', { id: existing.id }, 'DELETE'); router.back(); }} /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, minHeight: 48, fontFamily: Type.body, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
