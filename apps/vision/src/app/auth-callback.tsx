import { colors } from '@firstpass/ui';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, ui } from '../components/ui';
import { tabStorage } from '../lib/auth';
import { client, loadClub } from '../lib/supabase';
import { completeWebSignIn } from '../lib/webAuth';

/**
 * Where Google sends a coach back to after signing in on the web. It swaps
 * Google's one-time code for a session, then opens the page they were going
 * to. In the phone app the sign-in finishes in auth.ts instead, so this screen
 * only sends the app home and never touches the code.
 */
export default function AuthCallback() {
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return <WebCallback />;
}

function WebCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const club = await loadClub();
      const supabase = club ? client() : null;
      const result = await completeWebSignIn({
        search: window.location.search,
        hasClub: !!supabase,
        isSignedIn: async () => !!(await supabase?.auth.getSession())?.data.session,
        exchange: async (code) => {
          if (!supabase) return { error: { message: 'No club' } };
          const { error: swapError } = await supabase.auth.exchangeCodeForSession(code);
          return { error: swapError };
        },
        store: tabStorage(),
      });
      if (cancelled) return;
      // Replace, so the code never sits in the browser's history.
      if (result.kind === 'signed-in') router.replace(result.next as never);
      else setError(result.message);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={[ui.screen, styles.center]}>
      <View style={styles.page}>
        {error ? (
          <>
            <Text style={ui.error}>{error}</Text>
            <Btn label="Back to sign in" onPress={() => router.replace('/')} />
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.text} />
            <Text style={[ui.muted, styles.centerText]}>Signing you in…</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center' },
  page: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: 20, gap: 16 },
  centerText: { textAlign: 'center' },
});
