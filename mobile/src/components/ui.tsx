import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { MaxContentWidth, Radius, Spacing, Type, type Verdict } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { VERDICT_LABEL, useStore, type Category } from '@/lib/api';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// "1 day", "3 days": counts read naturally on screen and to screen readers.
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function Screen({ children, title, kicker, right }: { children: ReactNode; title: string; kicker?: string; right?: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { offline, error, busy } = useStore();
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + 120 }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {kicker ? <Text style={[styles.kicker, { color: t.textSecondary }]}>{kicker}</Text> : null}
            <Text style={[styles.title, { color: t.text }]} accessibilityRole="header">{title}</Text>
          </View>
          {right}
        </View>
        {offline ? <Banner tone="ask" icon="lan-disconnect" text="Can't reach the Shelfie server. Check EXPO_PUBLIC_API_URL." /> : null}
        {error ? <Banner tone="veto" icon="alert-circle-outline" text={error} /> : null}
        {busy ? <Banner tone="wait" icon="progress-clock" text={`${busy}…`} spinner /> : null}
        {children}
      </ScrollView>
    </View>
  );
}

export function Banner({ tone, icon, text, spinner }: { tone: Verdict; icon: IconName; text: string; spinner?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: t.surface, borderColor: t[tone] }]} accessibilityLiveRegion="polite">
      {spinner ? <ActivityIndicator color={t[tone]} /> : <MaterialCommunityIcons name={icon} size={18} color={t[tone]} />}
      <Text style={[styles.body, { color: t.text, flex: 1 }]}>{text}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }, style]}>{children}</View>;
}

export function Section({ title, hint, children, action }: { title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: Spacing.four, gap: Spacing.two }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: t.text }]} accessibilityRole="header">{title}</Text>
          {hint ? <Text style={[styles.small, { color: t.textSecondary }]}>{hint}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

export function T({ children, style, tone = 'text', variant = 'body', numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; tone?: 'text' | 'textSecondary' | Verdict | 'accent'; variant?: 'body' | 'small' | 'medium' | 'bold' | 'display' | 'mono'; numberOfLines?: number }) {
  const t = useTheme();
  const v = { body: styles.body, small: styles.small, medium: styles.medium, bold: styles.bold, display: styles.cardTitle, mono: styles.mono }[variant];
  return <Text numberOfLines={numberOfLines} style={[v, { color: t[tone] }, style]}>{children}</Text>;
}

export function Button({ label, onPress, icon, kind = 'primary', disabled }: { label: string; onPress: () => void; icon?: IconName; kind?: 'primary' | 'quiet' | Verdict; disabled?: boolean }) {
  const t = useTheme();
  const { busy } = useStore();
  const off = disabled || !!busy;
  const fill = kind === 'primary' ? t.accent : kind === 'quiet' ? 'transparent' : t[kind];
  const fg = kind === 'quiet' ? t.text : t.onAccent;
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityState={{ disabled: off }}
      style={({ pressed }) => [styles.button, { backgroundColor: fill, borderColor: kind === 'quiet' ? t.line : fill, opacity: off ? 0.5 : pressed ? 0.85 : 1 }]}>
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={[styles.chip, { backgroundColor: selected ? t.text : t.backgroundElement }]}>
      <Text style={[styles.medium, { color: selected ? t.background : t.text, fontSize: 14 }]}>{label}</Text>
    </Pressable>
  );
}

// The verdict, said plainly: colour plus a word, never colour alone.
export function Stamp({ verdict }: { verdict: Verdict }) {
  const t = useTheme();
  const icon: Record<Verdict, IconName> = { buy: 'check-circle', wait: 'timer-sand', veto: 'cancel', ask: 'help-circle' };
  return (
    <View style={[styles.stamp, { borderColor: t[verdict] }]}>
      <MaterialCommunityIcons name={icon[verdict]} size={14} color={t[verdict]} />
      <Text style={[styles.stampText, { color: t[verdict] }]}>{VERDICT_LABEL[verdict].toUpperCase()}</Text>
    </View>
  );
}

export function Sparkline({ values, now, width = 150, height = 36 }: { values: number[]; now?: number; width?: number; height?: number }) {
  const t = useTheme();
  if (values.length < 2) return null;
  const all = now != null ? [...values, now] : values;
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const x = (i: number) => 3 + (i / (values.length - 1)) * (width - 6);
  const y = (v: number) => height - 4 - ((v - lo) / span) * (height - 8);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height} accessibilityLabel={`Price over ${plural(values.length, 'day')}, from $${lo} to $${hi}`}>
      <Polyline points={pts} fill="none" stroke={t.textSecondary} strokeWidth={1.5} />
      {now != null ? <Circle cx={x(values.length - 1)} cy={y(now)} r={3.5} fill={t.accent} /> : null}
    </Svg>
  );
}

const CATEGORY_ICON: Record<Category, IconName> = { skincare: 'water-outline', makeup: 'lipstick', wardrobe: 'hanger', other: 'shape-outline' };
export function Glyph({ category, size = 40 }: { category: Category; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: Radius.md, backgroundColor: t.backgroundElement, alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name={CATEGORY_ICON[category] ?? 'shape-outline'} size={size * 0.5} color={t.text} />
    </View>
  );
}

// How long it's safe once opened (the open-jar symbol). Past it is flagged; the value is an assumption unless set.
export function UseBy({ a }: { a?: { months: number; useBy: string; daysToUseBy: number; past: boolean } | null }) {
  if (!a) return null;
  const when = new Date(`${a.useBy}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return a.past
    ? <T variant="small" tone="veto">{`Past its ${a.months}-month after-opening period (${when}). Worth replacing.`}</T>
    : <T variant="small" tone={a.daysToUseBy <= 30 ? 'wait' : 'textSecondary'}>{`Use by ${when} · ${a.months} months after opening`}</T>;
}

// Days left as a bar. Unknown stays grey and says so.
export function LifeBar({ daysLeft, life }: { daysLeft: number | null; life: number | null }) {
  const t = useTheme();
  if (daysLeft == null || !life) return <T variant="small" tone="textSecondary">Opened date unknown</T>;
  const f = Math.max(0, Math.min(1, daysLeft / life));
  const tone = f > 0.4 ? t.buy : f > 0.15 ? t.wait : t.veto;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.backgroundElement, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(4, f * 100)}%`, height: '100%', backgroundColor: tone }} />
      </View>
      <T variant="small" tone="textSecondary">{daysLeft <= 0 ? 'Probably empty' : `About ${plural(daysLeft, 'day')} left`}</T>
    </View>
  );
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: 'flex-start', gap: Spacing.two, paddingVertical: Spacing.four }}>
      <MaterialCommunityIcons name={icon} size={28} color={t.accent} />
      <T variant="display">{title}</T>
      <T tone="textSecondary">{text}</T>
      {action}
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, marginBottom: Spacing.two },
  kicker: { fontFamily: Type.medium, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontFamily: Type.display, fontSize: 36, lineHeight: 42 },
  sectionTitle: { fontFamily: Type.display, fontSize: 22, lineHeight: 28 },
  cardTitle: { fontFamily: Type.display, fontSize: 19, lineHeight: 24 },
  body: { fontFamily: Type.body, fontSize: 16, lineHeight: 22 },
  medium: { fontFamily: Type.medium, fontSize: 16, lineHeight: 22 },
  bold: { fontFamily: Type.bold, fontSize: 16, lineHeight: 22 },
  small: { fontFamily: Type.body, fontSize: 13.5, lineHeight: 19 },
  mono: { fontFamily: Type.mono, fontSize: 12, lineHeight: 17 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two + 2 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: Spacing.three, minHeight: 48 },
  buttonText: { fontFamily: Type.bold, fontSize: 15 },
  chip: { borderRadius: Radius.pill, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  stampText: { fontFamily: Type.bold, fontSize: 12, letterSpacing: 0.8 },
});
