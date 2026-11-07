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
        <NativeTabs.Trigger.Icon sf={{ default: 'sparkles', selected: 'sparkles' }} md={{ default: 'auto_awesome', selected: 'auto_awesome' }} />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        {waiting ? <NativeTabs.Trigger.Badge>{String(waiting)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shelf">
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" md="grid_view" />
        <NativeTabs.Trigger.Label>Shelf</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="checkin">
        <NativeTabs.Trigger.Icon sf="face.smiling" md="face" />
        <NativeTabs.Trigger.Label>Check-in</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="agent">
        <NativeTabs.Trigger.Icon sf="checklist" md="rule" />
        <NativeTabs.Trigger.Label>Agent</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
