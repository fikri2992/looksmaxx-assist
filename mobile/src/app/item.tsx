import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Chip, Screen, T } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORY_LABEL, mediaUrl, useStore, type Category, type Item } from '@/lib/api';
import { pickPhoto } from '@/lib/photo';

const CATS: Category[] = ['skincare', 'makeup', 'wardrobe', 'other'];
// Picked, not typed: run-out and use-by estimates key off these exact words (the server uses the same list).
const TYPES: Record<Category, string[]> = {
  skincare: ['cleanser', 'toner', 'serum', 'moisturizer', 'sunscreen'],
  makeup: ['foundation', 'concealer', 'powder', 'blush', 'bronzer', 'brow', 'eyeshadow', 'eyeliner', 'mascara', 'lipstick', 'lip gloss', 'primer', 'setting spray'],
  wardrobe: ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'accessory'],
  other: [],
};
// Typical months a product is good for once opened; mirrors AFTER_OPENING_MONTHS on the server.
const TYPICAL_MONTHS: Record<string, number> = { mascara: 3, eyeliner: 6, foundation: 12, concealer: 12, powder: 24, blush: 12, bronzer: 24, brow: 24, eyeshadow: 24, lipstick: 18, 'lip gloss': 12, 'setting spray': 12, primer: 12, cleanser: 12, toner: 12, serum: 6, moisturizer: 12, sunscreen: 12 };
const MONTHS = [3, 6, 12, 18, 24];
const COLOURS: [string, string][] = [['black', '#1E1A17'], ['white', '#F7F4EF'], ['grey', '#8E8A86'], ['beige', '#D8C3A5'], ['brown', '#7A5236'], ['navy', '#22324F'], ['blue', '#3D6FB6'], ['green', '#3E7D55'], ['olive', '#6B6B33'], ['red', '#B23A3A'], ['pink', '#D98BA0'], ['purple', '#7B5AA6'], ['yellow', '#E1B93E'], ['orange', '#D9793A']];
const SHADES: [string, string][] = [['fair', '#F1D3BC'], ['light', '#E2B999'], ['nude', '#C99A7E'], ['tan', '#B07D5B'], ['deep', '#7B4E35'], ['rich', '#4E2F21'], ['rose', '#C97B84'], ['coral', '#E07A5F'], ['berry', '#8E3B5A'], ['red', '#B4252B'], ['brown', '#6B4A3A'], ['black', '#1E1A17']];
const FINISHES = ['matte', 'satin', 'dewy', 'shimmer', 'cream'];
const STATUS: Record<Category, [Item['status'], string][]> = {
  skincare: [['active', 'In use'], ['low', 'Running low'], ['finished', 'Finished']],
  makeup: [['active', 'In use'], ['low', 'Running low'], ['finished', 'Finished']],
  wardrobe: [['active', 'In my closet'], ['finished', 'Let go']],
  other: [['active', 'In use'], ['finished', 'Gone']],
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const OPENED: [string, () => string][] = [['Today', today], ['About a week ago', () => daysAgo(7)], ['About a month ago', () => daysAgo(30)], ['About 3 months ago', () => daysAgo(91)]];
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const pretty = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function ItemScreen() {
  const t = useTheme();
  const { id, category } = useLocalSearchParams<{ id?: string; category?: Category }>();
  const { state, act } = useStore();
  const existing = state?.items.find((i) => i.id === id);
  const startCat: Category = existing?.category ?? category ?? 'skincare';
  const [form, setForm] = useState({
    name: existing?.name ?? '', brand: existing?.brand ?? '', category: startCat,
    type: existing?.type ?? '', color: existing?.color ?? '', shade: existing?.shade ?? '', finish: existing?.finish ?? '',
    opened: existing?.opened ?? '', status: existing?.status ?? 'active' as Item['status'],
    paoMonths: existing?.paoMonths ? String(existing.paoMonths) : '',
  });
  // A type outside the list (or "Something else") is typed by hand.
  const [customType, setCustomType] = useState(!!existing?.type && !TYPES[startCat].includes(existing.type));
  const [exactDate, setExactDate] = useState(!!existing?.opened);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K) => (v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const cat = form.category;
  const consumable = cat === 'skincare' || cat === 'makeup';
  const validDate = !form.opened || isDay(form.opened);
  const validShade = !form.shade || /^#[0-9a-f]{6}$/i.test(form.shade);
  const typical = TYPICAL_MONTHS[form.type];
  const missing = [!form.name.trim() && 'a name', !form.type.trim() && 'a type', !validDate && 'a real open date', !validShade && 'a valid shade'].filter(Boolean) as string[];
  const shownPhoto = photo ?? mediaUrl(existing?.photoId);

  // Back where you came from; opened directly (a shared link, a reload) it goes to the item's own tab.
  const leave = () => {
    if (router.canGoBack()) return router.back();
    router.replace(({ skincare: '/skin', makeup: '/makeup', wardrobe: '/closet', other: '/closet' } as const)[cat]);
  };
  const pickCategory = (c: Category) => setForm((f) => ({
    ...f, category: c, type: TYPES[c].includes(f.type) ? f.type : '',
    status: STATUS[c].some(([s]) => s === f.status) ? f.status : 'active',
  }));
  const choose = async (source: 'camera' | 'library') => {
    setPhotoErr(null);
    try { const p = await pickPhoto(source); if (p) setPhoto(p); } catch (e) { setPhotoErr(e instanceof Error ? e.message : String(e)); }
  };
  const save = async () => {
    const item = {
      name: form.name.trim(), brand: form.brand.trim() || null, category: cat, type: form.type.trim().toLowerCase(), status: form.status,
      color: form.color || null, shade: cat === 'makeup' ? form.shade || null : null, finish: cat === 'makeup' ? form.finish || null : null,
      opened: consumable ? form.opened || null : null, paoMonths: consumable && form.paoMonths ? Number(form.paoMonths) : null,
      ...(photo ? { photo } : {}),
    };
    await (existing ? act('Saving', '/api/items', { id: existing.id, patch: item }, 'PATCH') : act('Saving', '/api/items', { item }));
    leave();
  };
  const remove = () => {
    if (!existing) return;
    const go = async () => { await act('Deleting', '/api/items', { id: existing.id }, 'DELETE'); leave(); };
    const msg = `Remove ${existing.name}? The agent will stop counting it as something you own.`;
    if (Platform.OS === 'web') { if (window.confirm(msg)) go(); }
    else Alert.alert('Remove item', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };

  const input = (label: string, value: string, onChange: (v: string) => void, hint: string, extra?: object) => (
    <View style={{ gap: 6 }}>
      <T variant="small" tone="textSecondary">{label}</T>
      <TextInput value={value} onChangeText={onChange} placeholder={hint} placeholderTextColor={t.textSecondary} accessibilityLabel={label}
        style={[styles.input, { color: t.text, backgroundColor: t.background, borderColor: t.line }]} {...extra} />
    </View>
  );
  const label = (text: string, note?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two }}>
      <T variant="bold" style={{ fontSize: 15 }}>{text}</T>
      {note ? <T variant="small" tone="textSecondary" style={{ flex: 1 }}>{note}</T> : null}
    </View>
  );
  const swatches = (list: [string, string][], value: string, onPick: (name: string, hex: string) => void, selected: (name: string, hex: string) => boolean) => (
    <View style={styles.row}>
      {list.map(([name, hex]) => {
        const on = selected(name, hex);
        return (
          <Pressable key={name} onPress={() => onPick(name, hex)} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: on }}
            style={[styles.swatchChip, { borderColor: on ? t.text : t.line, backgroundColor: on ? t.backgroundElement : 'transparent' }]}>
            <View style={[styles.dot, { backgroundColor: hex, borderColor: t.textSecondary }]} />
            <T variant="small">{name}</T>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Screen title={existing ? existing.name : `Add ${CATEGORY_LABEL[cat].toLowerCase()}`} kicker={existing ? `${CATEGORY_LABEL[existing.category]} · ${existing.source}` : 'By hand'}
      right={<Button kind="quiet" label="Close" onPress={leave} />}>
      <Card style={{ gap: Spacing.three }}>
        <View style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'center' }}>
          {shownPhoto ? <Image source={shownPhoto} style={[styles.photo, { backgroundColor: t.backgroundElement }]} contentFit="cover" accessibilityLabel="Item photo" />
            : <View style={[styles.photo, { backgroundColor: t.backgroundElement }]} />}
          <View style={{ flex: 1, gap: Spacing.two }}>
            <Button kind="quiet" label={shownPhoto ? 'Retake' : 'Take a photo'} icon="camera-outline" onPress={() => choose('camera')} />
            <Button kind="quiet" label="From photos" icon="image-outline" onPress={() => choose('library')} />
          </View>
        </View>
        {photoErr ? <T variant="small" tone="veto">{photoErr}</T> : null}
        {input('Name', form.name, set('name'), { skincare: 'e.g. Gentle gel cleanser', makeup: 'e.g. Nude matte lipstick', wardrobe: 'e.g. Black linen top', other: 'e.g. Rose perfume' }[cat])}
        {input('Brand', form.brand, set('brand'), 'Optional')}
      </Card>

      <Card style={{ gap: Spacing.three }}>
        {label('What it is')}
        <View style={styles.row}>{CATS.map((c) => <Chip key={c} label={CATEGORY_LABEL[c]} selected={cat === c} onPress={() => pickCategory(c)} />)}</View>
        <View style={styles.row}>
          {TYPES[cat].map((ty) => <Chip key={ty} label={ty} selected={!customType && form.type === ty} onPress={() => { setCustomType(false); set('type')(ty); }} />)}
          <Chip label="Something else" selected={customType || (cat === 'other')} onPress={() => { setCustomType(true); if (TYPES[cat].includes(form.type)) set('type')(''); }} />
        </View>
        {customType || cat === 'other' ? input('Type', form.type, set('type'), cat === 'other' ? 'e.g. perfume, hair oil, razor' : 'Type it in', { autoCapitalize: 'none' }) : null}
      </Card>

      {cat === 'wardrobe' || cat === 'makeup' ? (
        <Card style={{ gap: Spacing.three }}>
          {cat === 'wardrobe' ? (
            <>
              {label('Colour', 'Helps it spot "you own 4 black tops".')}
              {swatches(COLOURS, form.color, (name) => set('color')(form.color === name ? '' : name), (name) => form.color === name)}
            </>
          ) : (
            <>
              {label('Shade', 'Pick the closest.')}
              {swatches(SHADES, form.shade, (name, hex) => setForm((f) => (f.shade === hex ? { ...f, shade: '', color: '' } : { ...f, shade: hex, color: name })), (_, hex) => form.shade.toLowerCase() === hex.toLowerCase())}
              {label('Finish')}
              <View style={styles.row}>{FINISHES.map((f) => <Chip key={f} label={f} selected={form.finish === f} onPress={() => set('finish')(form.finish === f ? '' : f)} />)}</View>
            </>
          )}
        </Card>
      ) : null}

      {consumable ? (
        <Card style={{ gap: Spacing.three }}>
          {label('Opened', form.opened && validDate ? pretty(form.opened) : 'Tells it when you will run out.')}
          <View style={styles.row}>
            <Chip label="Not opened yet" selected={!form.opened && !exactDate} onPress={() => { setExactDate(false); set('opened')(''); }} />
            {OPENED.map(([name, when]) => <Chip key={name} label={name} selected={!exactDate && !!form.opened && form.opened === when()} onPress={() => { setExactDate(false); set('opened')(when()); }} />)}
            <Chip label="Exact date" selected={exactDate} onPress={() => setExactDate(true)} />
          </View>
          {exactDate ? input('Date opened', form.opened, set('opened'), 'YYYY-MM-DD, e.g. 2026-10-20', { autoCapitalize: 'none', keyboardType: Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default' }) : null}
          {!validDate ? <T variant="small" tone="veto">Use a real date like 2026-10-20.</T> : null}

          {label('Good for after opening', 'The open-jar symbol on the pack, like “12M”.')}
          <View style={styles.row}>
            <Chip label={typical ? `Not sure (${typical} months is typical)` : 'Not sure'} selected={!form.paoMonths} onPress={() => set('paoMonths')('')} />
            {MONTHS.map((m) => <Chip key={m} label={`${m}M`} selected={form.paoMonths === String(m)} onPress={() => set('paoMonths')(String(m))} />)}
          </View>
        </Card>
      ) : null}

      <Card style={{ gap: Spacing.three }}>
        {label('Status')}
        <View style={styles.row}>{STATUS[cat].map(([s, name]) => <Chip key={s} label={name} selected={form.status === s} onPress={() => set('status')(s)} />)}</View>
      </Card>

      <View style={{ gap: Spacing.two }}>
        <Button label={existing ? 'Save changes' : 'Add it'} icon="check" disabled={missing.length > 0} onPress={save} />
        {missing.length ? <T variant="small" tone="textSecondary" style={{ textAlign: 'center' }}>{`Needs ${missing.join(' and ')}.`}</T> : null}
        {existing?.category === 'wardrobe' ? <Button kind="quiet" label={`Wore it today (${existing.wears?.length ?? 0} so far)`} icon="check-circle-outline" onPress={() => act('Logging', '/api/items/wear', { id: existing.id })} /> : null}
        {existing ? <Button kind="quiet" label="Remove" icon="trash-can-outline" onPress={remove} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, minHeight: 48, fontFamily: Type.body, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  photo: { width: 96, height: 128, borderRadius: Radius.md },
  swatchChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 6, minHeight: 36 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
});
