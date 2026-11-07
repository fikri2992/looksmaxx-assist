import { Fraunces_400Regular_Italic, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { StoreProvider } from '@/lib/api';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const [loaded] = useFonts({ Fraunces_600SemiBold, Fraunces_400Regular_Italic, InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_700Bold });
  useEffect(() => { if (loaded) SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: c.background, card: c.surface, text: c.text, border: c.line, primary: c.accent } }}>
      <StoreProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
          <Stack.Screen name="item" options={{ presentation: 'modal' }} />
          <Stack.Screen name="rules" options={{ presentation: 'modal' }} />
        </Stack>
      </StoreProvider>
    </ThemeProvider>
  );
}
