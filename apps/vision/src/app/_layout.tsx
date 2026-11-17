import { colors } from '@firstpass/ui';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * On the web, a page the browser brings back from its back-forward cache still
 * holds what it showed before, even after a sign-out. Load it again instead,
 * so the back button never shows a game to someone who has signed out.
 */
function useNoBackForwardCache() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);
}

export default function RootLayout() {
  useNoBackForwardCache();
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </SafeAreaProvider>
  );
}
