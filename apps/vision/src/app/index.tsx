import { colors } from '@firstpass/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppleButton, useAppleSignIn } from '../components/AppleButton';
import { Btn, ui } from '../components/ui';
import { VenueSection } from '../components/VenueSection';
import { signInWithApple } from '../lib/apple';
import { signInWithGoogle, signOut, useSession } from '../lib/auth';
import { clubs, type ClubEntry } from '../lib/clubs';
import { followGame, gameWhen, loadEarlierGames, loadGames, type GameListEntry } from '../lib/games';
import { chooseClub, leaveClub, useClub } from '../lib/supabase';
import { safeNext } from '../lib/webAuth';

/** Club, then sign-in, then the games this coach can follow. */
export default function Home() {
  const club = useClub();
  const session = useSession();
  // On the web, a game link opened while signed out comes here with ?next=/game?id=<id>.
  const { next } = useLocalSearchParams<{ next?: string }>();
  return (
    <SafeAreaView style={ui.screen}>
      <View style={styles.page}>
        <Wordmark />
        {club === undefined || (club && session === undefined) ? (
          <ActivityIndicator color={colors.text} style={styles.spinner} />
        ) : !club ? (
          <ChooseClub />
        ) : !session ? (
          <SignIn club={club} next={safeNext(next)} />
        ) : (
          <Games club={club} email={session.user.email ?? null} />
        )}
      </View>
    </SafeAreaView>
  );
}

function Wordmark() {
  return (
    <Text style={styles.wordmark} accessibilityRole="header">
      <Text style={{ color: colors.text }}>First</Text>
      <Text style={{ color: colors.attention }}>Pass</Text>
      <Text style={{ color: colors.selected }}> VISION</Text>
    </Text>
  );
}

function ChooseClub() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (clubs.length === 0) {
    return <Text style={ui.muted}>This build has no clubs set up. Ask your club for the FirstPass Vision build that includes your club.</Text>;
  }
  const submit = async () => {
    setError((await chooseClub(code)) ? null : 'No club has that code. Check it with your club admin.');
  };
  return (
    <View style={styles.form}>
      <Text style={ui.h1}>Your club code</Text>
      <Text style={ui.muted}>The same code you use for FirstPass HQ.</Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="CLUB CODE"
        placeholderTextColor={colors.textMuted}
        style={ui.input}
        onSubmitEditing={submit}
        accessibilityLabel="Club code"
      />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <Btn label="Connect" onPress={submit} disabled={!code.trim()} />
    </View>
  );
}

function SignIn({ club, next }: { club: ClubEntry; next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apple = useAppleSignIn();
  const go = async (how: () => Promise<void> = () => signInWithGoogle(next)) => {
    setBusy(true);
    setError(null);
    try {
      await how();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.form}>
      <Text style={ui.h1}>{club.name}</Text>
      <Text style={ui.muted}>
        {apple
          ? "Sign in the same way you do in FirstPass HQ, with Apple or Google. Coaches and managers see their team's games."
          : "Sign in with the Google account you use for FirstPass HQ. Coaches and managers see their team's games."}
      </Text>
      {Platform.OS === 'web' ? (
        <Text style={ui.muted}>Use your own phone or computer, not a shared one: you stay signed in in this browser until you sign out.</Text>
      ) : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {apple && !busy ? <AppleButton onPress={() => void go(signInWithApple)} /> : null}
      <Btn label={busy ? 'Signing in…' : 'Sign in with Google'} onPress={() => void go()} disabled={busy} />
      <Btn label="Change club" tone="quiet" onPress={() => void leaveClub()} />
    </View>
  );
}

const STATUS_LABEL: Record<GameListEntry['status'], string> = { setup: 'Not started', live: 'Live', final: 'Full time' };

function Games({ club, email }: { club: ClubEntry; email: string | null }) {
  const [games, setGames] = useState<GameListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  // Games from before the last few days, brought in a page at a time for their reports.
  const [earlier, setEarlier] = useState<GameListEntry[]>([]);
  const [more, setMore] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGames(await loadGames());
      setEarlier([]);
      setMore(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = [...(games ?? []), ...earlier];
  const loadEarlier = async () => {
    setLoadingEarlier(true);
    try {
      const page = await loadEarlierGames(shown.at(-1)?.createdAt ?? new Date().toISOString());
      setEarlier((held) => [...held, ...page.games]);
      setMore(page.more);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingEarlier(false);
    }
  };

  /** Follows the game by its id, then opens it. */
  const open = async (gameId: string) => {
    setOpening(gameId);
    setError(null);
    try {
      const id = await followGame(gameId);
      if (id) router.push({ pathname: '/game', params: { id } });
      else setError("This game isn't one you can see any more. Pull down to refresh the list.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(null);
    }
  };

  return (
    <View style={styles.games}>
      <View style={styles.row}>
        <Text style={[ui.h1, styles.grow]}>Games</Text>
        <Btn label="Season" tone="dim" onPress={() => router.push('/season')} style={styles.small} />
        <Btn label="Refresh" tone="dim" onPress={load} style={styles.small} />
      </View>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <FlatList
        data={shown}
        keyExtractor={(g) => g.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.text} />}
        ListEmptyComponent={
          games ? (
            <Text style={ui.muted}>
              No games for your teams in the last few days. When your statistician starts one in Vantage it shows here. Earlier games has the ones
              before that, with their reports.
            </Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.config.us} v ${item.config.them}, ${STATUS_LABEL[item.status]}`}
            onPress={() => open(item.id)}
            disabled={!!opening}
            style={({ pressed }) => [styles.game, pressed && ui.pressed]}
          >
            <View style={styles.grow}>
              <Text style={styles.gameTitle}>
                {item.config.us} v {item.config.them}
              </Text>
              <Text style={ui.muted}>
                {[item.teamName, gameWhen(item.createdAt)]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {opening === item.id ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={[styles.status, item.status === 'live' && styles.live]}>{STATUS_LABEL[item.status]}</Text>
            )}
          </Pressable>
        )}
        ListFooterComponent={
          games && more ? (
            <Btn label={loadingEarlier ? 'Loading…' : 'Earlier games'} tone="dim" onPress={() => void loadEarlier()} disabled={loadingEarlier} />
          ) : games && earlier.length > 0 ? (
            <Text style={[ui.muted, styles.end]}>No games before these.</Text>
          ) : undefined
        }
        contentContainerStyle={styles.list}
      />
      <VenueSection />
      <View style={styles.row}>
        <Text style={[ui.muted, styles.grow]} numberOfLines={1}>
          {club.name}
          {email ? ` · ${email}` : ''}
        </Text>
        <Btn label="Sign out" tone="quiet" onPress={() => void signOut()} style={styles.small} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', padding: 20, gap: 20 },
  wordmark: { fontSize: 32, fontWeight: '800', fontStyle: 'italic' },
  spinner: { marginTop: 40 },
  form: { gap: 14 },
  games: { flex: 1, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  small: { minHeight: 44 },
  end: { textAlign: 'center', paddingVertical: 8 },
  list: { gap: 10, paddingBottom: 8 },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceLine,
  },
  gameTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  status: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },
  live: { color: colors.attention },
});
