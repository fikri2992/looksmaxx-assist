import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { IconName } from './ui';

// The web build mirrors the phone's bottom tabs, so judges see the same app in a browser.
export default function AppTabs() {
  const t = useTheme();
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <View style={StyleSheet.flatten([styles.bar, { backgroundColor: t.surface, borderColor: t.line }])}>
          <TabTrigger name="index" href="/" asChild><TabButton icon="auto-fix">Today</TabButton></TabTrigger>
          <TabTrigger name="shelf" href="/shelf" asChild><TabButton icon="view-grid-outline">Shelf</TabButton></TabTrigger>
          <TabTrigger name="checkin" href="/checkin" asChild><TabButton icon="face-woman-outline">Check-in</TabButton></TabTrigger>
          <TabTrigger name="agent" href="/agent" asChild><TabButton icon="format-list-checks">Agent</TabButton></TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, icon, onPress }: TabTriggerSlotProps & { icon: IconName }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.button} accessibilityRole="tab" accessibilityState={{ selected: isFocused }}>
      <View style={[styles.pill, isFocused && { backgroundColor: t.backgroundSelected }]}>
        <MaterialCommunityIcons name={icon} size={22} color={isFocused ? t.accent : t.textSecondary} />
      </View>
      <Text style={[styles.label, { color: isFocused ? t.text : t.textSecondary }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingBottom: 12 },
  button: { flex: 1, maxWidth: 140, alignItems: 'center', gap: 4 },
  pill: { borderRadius: Radius.pill, paddingHorizontal: 18, paddingVertical: 4 },
  label: { fontFamily: Type.medium, fontSize: 12.5 },
});
