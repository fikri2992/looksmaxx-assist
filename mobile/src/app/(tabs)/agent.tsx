import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAudioPlayer } from 'expo-audio';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, plural, Stamp, T } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { API_URL, mediaUrl, useStore, type ChatMessage } from '@/lib/api';
import { useVoiceNote } from '@/lib/voice';

const STARTERS = ['What should I wear today?', 'I used the gel cleanser and moisturizer this morning', 'Do I need more sunscreen?', 'Make a look for a work dinner from my closet'];

export default function AgentChat() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { state, busy, error, act } = useStore();
  const [text, setText] = useState('');
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const voice = useVoiceNote();
  const player = useAudioPlayer(null);
  const messages = state?.chat ?? [];

  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); }, [messages.length, busy]);

  const send = async (msg = text) => {
    if (!msg.trim()) return;
    setText('');
    await act('Thinking', '/api/agent', { text: msg });
  };

  const talk = async () => {
    setVoiceErr(null);
    try {
      if (!voice.recording) return voice.start();
      const clip = await voice.stop();
      if (!clip || clip.seconds < 0.5) return;
      // The transcript lands in the chat as your message; the reply is spoken back.
      const r = await act('Listening', '/api/voice', clip);
      if (r?.audioUrl) { player.replace({ uri: `${API_URL}${r.audioUrl}` }); player.play(); }
    } catch (e) { setVoiceErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.head, { paddingTop: insets.top + Spacing.two, borderColor: t.line }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Your agent</Text>
          <T variant="small" tone="textSecondary">{`Knows ${plural(state?.items.length ?? 0, 'thing')} you own · ${plural(state?.memories.length ?? 0, 'memory', 'memories')} · rules v${state?.policy.version ?? 1}`}</T>
        </View>
        {/* GPT-Live call runs on a web page (browser WebRTC); on the phone it opens in the browser and needs an https server. */}
        <Pressable onPress={() => (Platform.OS === 'web' ? window.location.assign('/live') : Linking.openURL(`${API_URL}/live`))} accessibilityRole="button" accessibilityLabel="Live voice call" style={[styles.iconBtn, { borderColor: t.line }]}>
          <MaterialCommunityIcons name="phone-in-talk-outline" size={20} color={t.text} />
        </Pressable>
        <Pressable onPress={() => router.push('/rules')} accessibilityRole="button" accessibilityLabel="Rules and memory" style={[styles.iconBtn, { borderColor: t.line }]}>
          <MaterialCommunityIcons name="brain" size={20} color={t.text} />
        </Pressable>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={styles.list}>
        {!messages.length ? (
          <View style={{ gap: Spacing.three, marginTop: Spacing.four }}>
            <T variant="display">Talk to it like a friend who knows your closet.</T>
            <T tone="textSecondary">It checks what you own, your skin and the weather first, remembers what matters, and only buys through your tested rules. Hold the mic to speak.</T>
            <View style={{ gap: Spacing.two }}>
              {STARTERS.map((s) => (
                <Pressable key={s} onPress={() => send(s)} style={[styles.starter, { borderColor: t.line, backgroundColor: t.surface }]} accessibilityRole="button">
                  <T variant="medium">{s}</T>
                </Pressable>
              ))}
            </View>
          </View>
        ) : messages.map((m) => <Bubble key={m.id} m={m} />)}
        {busy ?<T variant="small" tone="textSecondary">{`${busy}…`}</T> : null}
        {error ? <Banner tone="veto" icon="alert-circle-outline" text={error} /> : null}
        {voiceErr ? <Banner tone="veto" icon="microphone-off" text={voiceErr} /> : null}
      </ScrollView>

      <View style={[styles.composer, { borderColor: t.line, backgroundColor: t.surface, marginBottom: Platform.OS === 'web' ? 84 : Spacing.two }]}>
        <TextInput value={text} onChangeText={setText} placeholder={voice.recording ? 'Listening… tap the mic to send' : 'Message your agent'} placeholderTextColor={t.textSecondary}
          multiline accessibilityLabel="Message your agent" style={[styles.input, { color: t.text }]} onSubmitEditing={() => send()} />
        {text.trim() ? (
          <Pressable onPress={() => send()} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Send" style={[styles.round, { backgroundColor: t.accent, opacity: busy ? 0.5 : 1 }]}>
            <MaterialCommunityIcons name="arrow-up" size={22} color={t.onAccent} />
          </Pressable>
        ) : (
          <Pressable onPress={talk} disabled={!!busy && !voice.recording} accessibilityRole="button" accessibilityLabel={voice.recording ? 'Stop and send voice' : 'Talk to your agent'}
            style={[styles.round, { backgroundColor: voice.recording ? t.veto : t.text }]}>
            <MaterialCommunityIcons name={voice.recording ? 'stop' : 'microphone'} size={22} color={t.background} />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  const t = useTheme();
  const { state, busy, act } = useStore();
  const mine = m.role === 'user';
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 6 }}>
      {m.actions?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {m.actions.map((a, i) => (
            <View key={i} style={[styles.action, { borderColor: a.ok ? t.buy : t.veto }]}>
              <MaterialCommunityIcons name={a.ok ? 'check' : 'close'} size={13} color={a.ok ? t.buy : t.veto} />
              <T variant="small" style={{ fontSize: 12.5 }}>{a.summary}</T>
            </View>
          ))}
        </View>
      ) : null}
      <View style={[styles.bubble, mine ? { backgroundColor: t.text, borderBottomRightRadius: 4 } : { backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 }]}>
        {m.voice ? <MaterialCommunityIcons name="microphone" size={13} color={mine ? t.background : t.textSecondary} /> : null}
        <Text style={{ fontFamily: Type.body, fontSize: 16, lineHeight: 22, color: mine ? t.background : t.text }}>{m.text}</Text>
      </View>
      {m.attachments?.map((a, i) => {
        if (a.kind === 'look' && a.photoId) return <Image key={i} source={mediaUrl(a.photoId)} style={styles.look} contentFit="cover" accessibilityLabel="Generated look" />;
        const d = state?.decisions.find((x) => x.id === a.decisionId);
        if (!d) return null;
        // The agent prepared a refund; money only moves when you tap.
        if (a.kind === 'refund') {
          const done = d.paypal?.status === 'refunded';
          return (
            <View key={i} style={[styles.decision, { borderColor: t.line, backgroundColor: t.surface, flexDirection: 'column', alignItems: 'stretch' }]}>
              <T variant="small">{`${d.product?.title ?? 'Purchase'} · $${d.paypal?.amount ?? '?'}`}</T>
              <T variant="small" tone="textSecondary">{`Reason: ${a.reason ?? 'Returned'}`}</T>
              {done ? <T variant="small" tone="buy">Refunded through PayPal</T>
                : <Button kind="veto" icon="cash-refund" label={`Refund $${d.paypal?.amount ?? ''} to PayPal`} disabled={!!busy} onPress={() => act('Refunding', '/api/refund', { id: d.id, reason: a.reason })} />}
            </View>
          );
        }
        return (
          <Pressable key={i} onPress={() => router.push('/')} style={[styles.decision, { borderColor: t.line, backgroundColor: t.surface }]}>
            <Stamp verdict={d.verdict} />
            <T variant="small" numberOfLines={2} style={{ flex: 1 }}>{d.product ? `${d.product.title} · $${d.product.price}` : d.need.need}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: Type.display, fontSize: 26, lineHeight: 32 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingBottom: Spacing.five },
  starter: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.three },
  bubble: { maxWidth: '86%', borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  look: { width: 220, height: 330, borderRadius: Radius.lg },
  decision: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two, maxWidth: '86%' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, marginHorizontal: Spacing.three, borderWidth: 1, borderRadius: 26, padding: 6, paddingLeft: 16, width: 'auto', maxWidth: MaxContentWidth },
  input: { flex: 1, fontFamily: Type.body, fontSize: 16, maxHeight: 120, paddingVertical: 10 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
