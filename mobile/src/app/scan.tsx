import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Banner, Button, Card, Glyph, Screen, Section, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORY_LABEL, useStore } from '@/lib/api';
import { pickPhoto } from '@/lib/photo';

// Photo → the model reads what it can → you confirm. Nothing is saved until you do.
export default function Scan() {
  const t = useTheme();
  const { state, act } = useStore();
  const drafts = state?.shelfDrafts ?? [];
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setKeep(Object.fromEntries(drafts.map((d) => [d.id, d.keep]))); }, [drafts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const scan = async (source: 'camera' | 'library') => {
    setErr(null);
    try {
      const image = await pickPhoto(source);
      if (image) await act('Reading your photo', '/api/shelf', { image });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const confirm = async () => {
    await act('Saving to your shelf', '/api/shelf/confirm', { ids: drafts.filter((d) => keep[d.id]).map((d) => d.id) });
    router.back();
  };

  return (
    <Screen title="Scan" kicker="Shelf, makeup bag or wardrobe" right={<Button kind="quiet" label="Close" onPress={() => router.back()} />}>
      {err ? <Banner tone="veto" icon="camera-off" text={err} /> : null}
      {!drafts.length ? (
        <Card style={{ gap: Spacing.three }}>
          <MaterialCommunityIcons name="image-filter-center-focus" size={32} color={t.accent} />
          <T variant="display">One photo, then you check the list</T>
          <T tone="textSecondary">The model reads labels well, but it can miscount or guess how full something is. So it shows its guesses, and only what you confirm is saved.</T>
          <View style={{ gap: Spacing.two }}>
            <Button label="Take a photo" icon="camera-outline" onPress={() => scan('camera')} />
            <Button kind="quiet" label="Choose from photos" icon="image-outline" onPress={() => scan('library')} />
          </View>
          <T variant="small" tone="textSecondary">The photo goes to an AI model to be read, and Shelfie doesn’t keep it.</T>
        </Card>
      ) : (
        <Section title={`Found ${drafts.length}`} hint="Tap to keep or drop. Unreadable or unsure items start unticked.">
          {drafts.map((d) => (
            <Pressable key={d.id} onPress={() => setKeep((k) => ({ ...k, [d.id]: !k[d.id] }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!keep[d.id] }}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three, opacity: keep[d.id] ? 1 : 0.55 }}>
                <MaterialCommunityIcons name={keep[d.id] ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={keep[d.id] ? t.accent : t.textSecondary} />
                <Glyph category={d.category} size={36} />
                <View style={{ flex: 1 }}>
                  <T variant="medium" numberOfLines={2}>{d.brand ? `${d.brand} ${d.name}` : d.name}</T>
                  <T variant="small" tone="textSecondary">{`${CATEGORY_LABEL[d.category] ?? d.category} · ${d.type} · ${Math.round(d.confidence * 100)}% sure`}</T>
                </View>
              </Card>
            </Pressable>
          ))}
          <Button label={`Save ${Object.values(keep).filter(Boolean).length} to my shelf`} icon="check" onPress={confirm} />
        </Section>
      )}
    </Screen>
  );
}
