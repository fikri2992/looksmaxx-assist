import '@/global.css';

import { Platform } from 'react-native';

// Warm porcelain and ink, with a clay accent. Verdict colours are kept apart so a glance tells buy from wait from no.
export const Colors = {
  light: {
    text: '#1E1A17',
    textSecondary: '#6F655C',
    background: '#F6F1EB',
    surface: '#FFFFFF',
    backgroundElement: '#EFE7DE',
    backgroundSelected: '#E4D8CB',
    line: '#E3D9CE',
    accent: '#B5533C',
    onAccent: '#FFFFFF',
    buy: '#2F7D5B',
    wait: '#9A6A16',
    veto: '#7A3E6B',
    ask: '#3B5BA5',
  },
  dark: {
    text: '#F3ECE6',
    textSecondary: '#A89D93',
    background: '#141110',
    surface: '#1E1A18',
    backgroundElement: '#2A2421',
    backgroundSelected: '#382F2B',
    line: '#3A322D',
    accent: '#E07A5F',
    onAccent: '#1A0F0B',
    buy: '#58B88E',
    wait: '#E0A93E',
    veto: '#C98BBE',
    ask: '#8FA8EC',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Verdict = 'buy' | 'wait' | 'veto' | 'ask';

export const Type = {
  display: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_400Regular_Italic',
  body: 'InstrumentSans_400Regular',
  medium: 'InstrumentSans_500Medium',
  bold: 'InstrumentSans_700Bold',
  mono: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'monospace' }),
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 720;
