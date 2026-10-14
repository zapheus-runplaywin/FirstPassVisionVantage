import { colors } from '@firstpass/ui';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, s } from '../components/ui';
import { signInWithGoogle, signOut, useSession } from '../lib/auth';
import { listGames, type SavedGame } from '../lib/db';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [games, setGames] = useState<SavedGame[]>([]);
  const session = useSession();
  const [signInError, setSignInError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => setGames(listGames()), []));
  const signIn = () =>
    signInWithGoogle().then(
      () => setSignInError(null),
      (e: unknown) => setSignInError(e instanceof Error ? e.message : 'Sign-in failed'),
    );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.wordmark}>
          <Text style={{ color: colors.text }}>First</Text>
          <Text style={{ color: colors.attention }}>Pass</Text>
          <Text style={{ color: colors.selected, fontSize: 22 }}> VANTAGE</Text>
        </Text>
        <Text style={s.muted}>Live stats entry. Games are saved on this device as you go, with or without signal.</Text>
        {supabase ? (
          <View style={styles.account}>
            {session ? (
              <>
                <Text style={s.text}>Signed in as {session.user.email}</Text>
                <Btn label="Sign out" tone="quiet" onPress={() => void signOut()} />
              </>
            ) : (
              <>
                <Text style={s.muted}>Sign in to send games to your club as you record them. You can still record without signing in.</Text>
                <Btn label="Sign in with Google" onPress={() => void signIn()} />
              </>
            )}
            {signInError ? <Text style={styles.error}>{signInError}</Text> : null}
          </View>
        ) : null}
        <Btn label="New game" tone="primary" big onPress={() => router.push('/setup')} style={styles.new} />
        {games.length ? <Text style={s.h2}>Saved games</Text> : null}
        {games.map((g) => (
          <Btn key={g.id} tone="target" onPress={() => router.push({ pathname: '/game/[id]', params: { id: g.id } })} style={styles.game}>
            <View style={styles.gameRow}>
              <Text style={styles.gameName}>
                {g.config.us} v {g.config.them}
              </Text>
              <Text style={styles.gameDate}>{new Date(g.createdAt).toLocaleString()}</Text>
            </View>
          </Btn>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  inner: { padding: 16, gap: 12, maxWidth: 900, width: '100%', alignSelf: 'center' },
  wordmark: { fontSize: 36, fontWeight: '800', fontStyle: 'italic' },
  new: { alignSelf: 'flex-start', minWidth: 240 },
  game: { alignItems: 'stretch' },
  gameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  gameName: { color: colors.targetText, fontSize: 17, fontWeight: '700' },
  gameDate: { color: '#4b5a73', fontSize: 13 },
  account: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  error: { color: colors.attention },
});
