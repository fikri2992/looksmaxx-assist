import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/lib/api';

export default function AppTabs() {
  const t = useTheme();
  const { state } = useStore();
  const waiting = state?.decisions.filter((d) => (d.verdict === 'buy' || d.verdict === 'ask') && !d.paypal).length ?? 0;
  return (
    <NativeTabs backgroundColor={t.surface} indicatorColor={t.backgroundSelected} tintColor={t.accent} labelStyle={{ color: t.textSecondary, selected: { color: t.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="sparkles" md="auto_awesome" />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        {waiting ? <NativeTabs.Trigger.Badge>{String(waiting)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="closet">
        <NativeTabs.Trigger.Icon sf="tshirt" md="checkroom" />
        <NativeTabs.Trigger.Label>Closet</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="skin">
        <NativeTabs.Trigger.Icon sf="drop" md="water_drop" />
        <NativeTabs.Trigger.Label>Skin</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="makeup">
        <NativeTabs.Trigger.Icon sf="paintpalette" md="palette" />
        <NativeTabs.Trigger.Label>Makeup</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="agent">
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right" md="forum" />
        <NativeTabs.Trigger.Label>Agent</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
