import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Platform } from 'react-native';

import type { Verdict } from '@/constants/theme';

// The server holds every secret (PayPal, OpenRouter) and does the agent work. Set EXPO_PUBLIC_API_URL to the
// server's address for a phone on your network, or to the hosted demo.
export const API_URL = process.env.EXPO_PUBLIC_API_URL
  ?? (Platform.OS === 'android' ? 'http://10.0.2.2:8095' : 'http://localhost:8095');

export type Category = 'skincare' | 'makeup' | 'wardrobe' | 'other';
export type Item = {
  id: string; name: string; brand?: string | null; category: Category; type: string; color?: string | null;
  opened?: string | null; status: 'active' | 'low' | 'finished'; source: string; createdAt: string;
  daysLeft: number | null; life: number | null; basis: string;
  photoId?: string | null; wears?: string[]; shade?: string | null; finish?: string | null; season?: string | null; occasion?: string | null;
};
export type Memory = { id: string; at: string; text: string; kind: string; source: string };
export type DiaryEntry = { id: string; date: string; am?: string[]; pm?: string[]; feel?: string | null; notes?: string };
export type Look = { id: string; at: string; itemIds: string[]; photoId: string; note: string; fromPhotos: number };
export type ChatMessage = { id: string; at: string; role: 'user' | 'assistant'; text: string; voice?: boolean; actions?: { tool: string; summary: string; ok: boolean }[]; attachments?: { kind: 'look' | 'decision'; lookId?: string; photoId?: string; decisionId?: string }[] };
export const mediaUrl = (id?: string | null) => (id ? `${API_URL}/photos/${id}` : null);
export type SkinTrait = { trait: string; level: 'none' | 'mild' | 'noticeable'; where?: string | null; confidence?: number };
export type CheckIn = {
  id: string; at: string; live: boolean; changes: string[];
  reading: { usable?: boolean; photo_problem?: string | null; skin?: SkinTrait[]; makeup?: { wearing: boolean; steps: { step: string; look: string; color_hex?: string | null; finish?: string | null }[] }; cannot_tell?: string[] };
};
export type Reason = { rule: string; then?: Verdict; because: string };
export type Decision = {
  id: string; at: string; verdict: Verdict; reasons: Reason[]; policyVersion: number; note?: string;
  need: { need: string; category?: Category; type?: string; why?: string };
  product: { id: string; title: string; brand?: string | null; image?: string | null; store: string; price: number; was?: number | null } | null;
  history?: { source: string; ourDays: number; rows: { at: string; price: number }[] };
  facts?: Record<string, number | string | boolean>;
  rejected: { title: string; why: string }[]; alternatives: { title: string; price: number; verdict: Verdict }[]; substitutedFor?: { reason: string };
  paypal?: { orderId?: string; authId?: string; captureId?: string; refundId?: string; status?: 'captured' | 'voided' | 'refunded'; amount?: number; authorized?: number; payee?: string; firstApproval?: boolean };
  finalCheck?: { at: string; livePrice: number; verdict: Verdict; reasons: Reason[] };
};
export type PolicyVersion = { version: number; createdBy: 'seed' | 'agent'; reason: string; activatedAt: string | null; proposedAt?: string; ruleCount: number; testCount: number; diff?: { added: string[]; removed: string[]; changed: string[] }; testResults?: { name: string; pass: boolean; expect: string; got: string }[] | null; errors?: string[] };
export type Rule = { id: string; then: Verdict; because: string; when: { fact: string; op: string; value?: unknown }[] };
export type WatchJob = { id: string; createdAt: string; createdBy: string; title: string; trigger: { op: string; price: number }; everyHours: number; lastRun: string | null; firedAt: string | null };
export type Draft = { id: string; name: string; brand: string | null; category: Category; type: string; color?: string | null; confidence: number; readable?: boolean; keep: boolean };
export type LogEntry = { id: string; at: string; kind: string; text: string };
export type State = {
  settings: { rules: { askAbove: number; monthlyBudget: number }; location: { lat: number; lon: number; label: string }; hasPaypal: boolean; storeAccount: boolean };
  items: Item[]; checkins: CheckIn[]; reactions: { id: string; item: string; note: string; avoid: string[]; source: string }[];
  decisions: Decision[]; policy: { version: number; rules: Rule[] }; policyVersions: PolicyVersion[];
  watchJobs: WatchJob[]; log: LogEntry[]; shelfDrafts: Draft[]; modelSpend: number; error?: string; approveUrl?: string;
  memories: Memory[]; diary: DiaryEntry[]; looks: Look[]; chat: ChatMessage[];
  outfit?: { day: string; itemIds: string[]; reason: string; worn?: boolean; weather?: { uvMax: number; feelsMax: number; rainChance: number } | null } | null;
  insights?: { days: number; liveCheckins: number; note: string; results: { itemId: string; name: string; usedDays: number; otherDays: number; diff: number | null; verdict: 'seems to help' | 'seems to hurt' | 'no clear effect' | 'not enough data' }[] };
  heard?: string; reply?: string; audioUrl?: string;
};
export type Weather = { date: string; uvMax: number; feelsMax: number; rainChance: number; humidity: number }[];

type Ctx = {
  state: State | null; weather: Weather | null; busy: string | null; error: string | null; offline: boolean;
  refresh: () => Promise<void>;
  act: (label: string, path: string, body?: unknown, method?: string) => Promise<State | null>;
};
const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/state`);
      setState(await res.json());
      setOffline(false);
    } catch { setOffline(true); }
  }, []);

  const act = useCallback(async (label: string, path: string, body?: unknown, method = 'POST') => {
    setBusy(label);
    setError(null);
    // Long agent work saves as it goes, so poll to show progress.
    poll.current = setInterval(refresh, 2000);
    try {
      const res = await fetch(`${API_URL}${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      const data: State = await res.json();
      if (data.approveUrl) await Linking.openURL(data.approveUrl);
      if (data.error) setError(data.error);
      if (data.items) setState(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      if (poll.current) clearInterval(poll.current);
      setBusy(null);
    }
  }, [refresh]);

  useEffect(() => {
    // First load from the server; this is syncing with an external system, which is what effects are for.
    refresh(); // eslint-disable-line react-hooks/set-state-in-effect
    fetch(`${API_URL}/api/weather`).then((r) => r.json()).then(setWeather).catch(() => {});
  }, [refresh]);

  return <StoreContext.Provider value={{ state, weather, busy, error, offline, refresh, act }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}

export const CATEGORY_LABEL: Record<Category, string> = { skincare: 'Skincare', makeup: 'Makeup', wardrobe: 'Wardrobe', other: 'Other' };
export const VERDICT_LABEL: Record<Verdict, string> = { buy: 'Buy', wait: 'Wait', veto: 'Skip', ask: 'Your call' };
