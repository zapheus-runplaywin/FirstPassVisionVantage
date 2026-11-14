import { colors } from '@firstpass/ui';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, ui } from '../components/ui';
import { signInWithGoogle, signOut, useSession } from '../lib/auth';
import { clubs, type ClubEntry } from '../lib/clubs';
import { followGame, loadGames, type GameListEntry } from '../lib/games';
import { chooseClub, leaveClub, useClub } from '../lib/supabase';

/** Club, then sign-in, then the games this coach can follow. */
export default function Home() {
  const club = useClub();
  const session = useSession();
  return (
    <SafeAreaView style={ui.screen}>
      <View style={styles.page}>
        <Wordmark />
        {club === undefined || (club && session === undefined) ? (
          <ActivityIndicator color={colors.text} style={styles.spinner} />
        ) : !club ? (
          <ChooseClub />
        ) : !session ? (
          <SignIn club={club} />
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

function SignIn({ club }: { club: ClubEntry }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.form}>
      <Text style={ui.h1}>{club.name}</Text>
      <Text style={ui.muted}>Sign in with the Google account you use for FirstPass HQ. Coaches and managers see their team's games.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <Btn label={busy ? 'Signing in…' : 'Sign in with Google'} onPress={go} disabled={busy} />
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGames(await loadGames());
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

  /** Follows the game by its id, then opens it. */
  const open = async (gameId: string) => {
    setOpening(gameId);
    setError(null);
    try {
      const id = await followGame(gameId);
      if (id) router.push({ pathname: '/game/[id]', params: { id } });
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
        <Btn label="Refresh" tone="dim" onPress={load} style={styles.small} />
      </View>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <FlatList
        data={games ?? []}
        keyExtractor={(g) => g.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.text} />}
        ListEmptyComponent={
          games ? (
            <Text style={ui.muted}>
              No games for your teams in the last few days. When your statistician starts one in Vantage it shows here.
            </Text>
          ) : null
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
                {[item.teamName, new Date(item.createdAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })]
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
        contentContainerStyle={styles.list}
      />
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
