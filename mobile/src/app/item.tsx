import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Chip, Screen, T } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORY_LABEL, mediaUrl, useStore, type Category, type Item } from '@/lib/api';
import { pickPhoto } from '@/lib/photo';

const CATS: Category[] = ['skincare', 'makeup', 'wardrobe', 'other'];
const STATUS: Item['status'][] = ['active', 'low', 'finished'];
const STATUS_LABEL = { active: 'In use', low: 'Running low', finished: 'Finished' };

export default function ItemScreen() {
  const t = useTheme();
  const { id, category } = useLocalSearchParams<{ id?: string; category?: Category }>();
  const { state, act } = useStore();
  const existing = state?.items.find((i) => i.id === id);
  const [form, setForm] = useState({
    name: existing?.name ?? '', brand: existing?.brand ?? '', category: existing?.category ?? category ?? 'skincare' as Category,
    type: existing?.type ?? '', color: existing?.color ?? '', shade: existing?.shade ?? '', finish: existing?.finish ?? '',
    opened: existing?.opened ?? '', status: existing?.status ?? 'active' as Item['status'],
    paoMonths: existing?.paoMonths ? String(existing.paoMonths) : '',
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const validDate = !form.opened || /^\d{4}-\d{2}-\d{2}$/.test(form.opened);
  const validShade = !form.shade || /^#[0-9a-f]{6}$/i.test(form.shade);
  const validPao = !form.paoMonths || (/^\d{1,2}$/.test(form.paoMonths) && Number(form.paoMonths) >= 1 && Number(form.paoMonths) <= 60);
  const shownPhoto = photo ?? mediaUrl(existing?.photoId);

  const choose = async (source: 'camera' | 'library') => {
    setPhotoErr(null);
    try { const p = await pickPhoto(source); if (p) setPhoto(p); } catch (e) { setPhotoErr(e instanceof Error ? e.message : String(e)); }
  };
  const save = async () => {
    const item = { ...form, brand: form.brand || null, color: form.color || null, shade: form.shade || null, finish: form.finish || null, opened: form.opened || null, paoMonths: validPao && form.paoMonths ? Number(form.paoMonths) : null, ...(photo ? { photo } : {}) };
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
        <View style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'center' }}>
          {shownPhoto ? <Image source={shownPhoto} style={[styles.photo, { backgroundColor: t.backgroundElement }]} contentFit="cover" accessibilityLabel="Item photo" />
            : <View style={[styles.photo, { backgroundColor: t.backgroundElement }]} />}
          <View style={{ flex: 1, gap: Spacing.two }}>
            <Button kind="quiet" label={shownPhoto ? 'Retake photo' : 'Take a photo'} icon="camera-outline" onPress={() => choose('camera')} />
            <Button kind="quiet" label="Choose a photo" icon="image-outline" onPress={() => choose('library')} />
          </View>
        </View>
        {photoErr ? <T variant="small" tone="veto">{photoErr}</T> : null}
        <T variant="small" tone="textSecondary">A photo lets the agent style looks from your real pieces.</T>
        {field('Name', 'name', 'Gentle gel cleanser')}
        {field('Brand (optional)', 'brand', '')}
        <View style={{ gap: 6 }}>
          <T variant="small" tone="textSecondary">Category</T>
          <View style={styles.row}>{CATS.map((c) => <Chip key={c} label={CATEGORY_LABEL[c]} selected={form.category === c} onPress={() => set('category')(c)} />)}</View>
        </View>
        {field('Type', 'type', form.category === 'wardrobe' ? 'top, dress, shoes…' : 'cleanser, sunscreen, lipstick…')}
        {form.category === 'wardrobe' || form.category === 'makeup' ? field('Colour (optional)', 'color', 'black, nude, coral…') : null}
        {form.category === 'makeup' ? field('Shade hex (optional)', 'shade', '#C9A08A') : null}
        {form.category === 'makeup' ? field('Finish (optional)', 'finish', 'matte, satin, dewy…') : null}
        {!validShade ? <T variant="small" tone="veto">Use a hex colour like #C9A08A.</T> : null}
        {form.category !== 'wardrobe' ? field('Opened on (YYYY-MM-DD)', 'opened', '2026-10-20') : null}
        {!validDate ? <T variant="small" tone="veto">Use the format 2026-10-20.</T> : null}
        {/* The open-jar symbol on the pack, e.g. "12M". Empty uses a typical value for the type. */}
        {form.category === 'skincare' || form.category === 'makeup' ? field(`Months after opening, from the label${existing?.afterOpening && !existing.paoMonths ? ` (now assuming ${existing.afterOpening.months})` : ''}`, 'paoMonths', '12') : null}
        {!validPao ? <T variant="small" tone="veto">A number of months from 1 to 60, like the “12M” on the jar.</T> : null}
        <View style={{ gap: 6 }}>
          <T variant="small" tone="textSecondary">Status</T>
          <View style={styles.row}>{STATUS.map((s) => <Chip key={s} label={STATUS_LABEL[s]} selected={form.status === s} onPress={() => set('status')(s)} />)}</View>
        </View>
        <Button label="Save" icon="check" disabled={!form.name || !form.type || !validDate || !validShade || !validPao} onPress={save} />
        {existing?.category === 'wardrobe' ? <Button kind="quiet" label={`Wore it today (${existing.wears?.length ?? 0} so far)`} icon="check-circle-outline" onPress={() => act('Logging', '/api/items/wear', { id: existing.id })} /> : null}
        {existing ? <Button kind="quiet" label="Delete" icon="trash-can-outline" onPress={async () => { await act('Deleting', '/api/items', { id: existing.id }, 'DELETE'); router.back(); }} /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, minHeight: 48, fontFamily: Type.body, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  photo: { width: 96, height: 128, borderRadius: Radius.md },
});
