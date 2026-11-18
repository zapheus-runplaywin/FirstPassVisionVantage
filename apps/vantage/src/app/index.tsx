import { colors } from '@firstpass/ui';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, s } from '../components/ui';
import { gameStatus, mergeStreams, type GameStatus } from '@firstpass/engine';
import { signInWithGoogle, signOut, useSession } from '../lib/auth';
import { clubs } from '../lib/clubs';
import { listGames, loadEvents, type SavedGame } from '../lib/db';
import { deckWanted, setDeckWanted } from '../lib/deck';
import { joinAsHelper } from '../lib/helper';
import { chooseClub, leaveClub, useClub } from '../lib/supabase';

export default function Home() {
  const [games, setGames] = useState<(SavedGame & { status: GameStatus })[]>([]);
  const session = useSession();
  const club = useClub();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const findClub = () => {
    if (chooseClub(code)) setCodeError(null);
    else setCodeError('No club has that code. Check it with your club admin.');
  };
  useFocusEffect(useCallback(() => setGames(listGames().map((g) => ({ ...g, status: gameStatus(g.config, mergeStreams(loadEvents(g.id))) }))), []));
  const [helpCode, setHelpCode] = useState('');
  const [helpError, setHelpError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [deck, setDeck] = useState(deckWanted);
  const help = () => {
    setJoining(true);
    setHelpError(null);
    joinAsHelper(helpCode)
      .then(
        (id) => {
          setHelpCode('');
          router.push({ pathname: '/help/[id]', params: { id } });
        },
        (e: unknown) => setHelpError(e instanceof Error ? e.message : 'Could not join the game'),
      )
      .finally(() => setJoining(false));
  };
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
        {clubs.length > 0 && !club ? (
          <View style={styles.account}>
            <Text style={s.muted}>Enter your club code to send games to your club as you record them. You can still record without one.</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Club code"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              onSubmitEditing={findClub}
            />
            <Btn label="Find your club" onPress={findClub} />
            {codeError ? <Text style={styles.error}>{codeError}</Text> : null}
          </View>
        ) : null}
        {club ? (
          <View style={styles.account}>
            <Text style={s.text}>{club.name}</Text>
            {session ? (
              <>
                <Text style={s.muted}>Signed in as {session.user.email}</Text>
                <Btn label="Sign out" tone="quiet" onPress={() => void signOut()} />
              </>
            ) : (
              <Btn label="Sign in with Google" onPress={() => void signIn()} />
            )}
            <Btn label="Change club" tone="quiet" onPress={leaveClub} />
            {signInError ? <Text style={styles.error}>{signInError}</Text> : null}
          </View>
        ) : null}
        <Btn label="New game" tone="primary" big onPress={() => router.push('/setup')} style={styles.new} />
        {club && session ? (
          <View style={styles.help}>
            <Text style={s.h2}>Help with a game</Text>
            <Text style={s.muted}>
              Do the substitutions and fix mistakes for a game someone else is recording. Ask them to turn the helper on (Helper, on their game screen) and
              type the code it shows.
            </Text>
            <View style={styles.account}>
              <TextInput
                value={helpCode}
                onChangeText={setHelpCode}
                keyboardType="number-pad"
                maxLength={7}
                placeholder="Pair code"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                onSubmitEditing={help}
              />
              <Btn label={joining ? 'Joining…' : 'Help with this game'} disabled={joining || helpCode.replace(/\D/g, '').length !== 6} onPress={help} />
            </View>
            {helpError ? <Text style={styles.error}>{helpError}</Text> : null}
          </View>
        ) : null}
        <View style={styles.help}>
          <Text style={s.h2}>Stream Deck</Text>
          <Text style={s.muted}>
            On a Mac with a 32-key Stream Deck XL and the FirstPass Vantage plugin, the keys do who, what and the detail while you tap where on the court.
            Leave this off on a tablet or phone.
          </Text>
          <View style={styles.account}>
            <Btn
              label={deck ? 'Stream Deck keys are on' : 'Use Stream Deck keys'}
              tone={deck ? 'selected' : 'target'}
              onPress={() => {
                setDeckWanted(!deck);
                setDeck(!deck);
              }}
            />
          </View>
        </View>
        {games.length ? <Text style={s.h2}>Saved games</Text> : null}
        {games.map((g) => (
          <Btn
            key={g.id}
            tone="target"
            onPress={() => router.push({ pathname: g.ownStream === 'primary' ? '/game/[id]' : '/help/[id]', params: { id: g.id } })}
            style={styles.game}
          >
            <View style={styles.gameRow}>
              <Text style={styles.gameName}>
                {g.config.us} v {g.config.them}
                {g.ownStream === 'primary' ? '' : ' · helping'}
              </Text>
              <Text style={styles.gameStatus}>
                {g.status.label} · {g.status.score.us}–{g.status.score.them}
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
  help: { gap: 8 },
  game: { alignItems: 'stretch' },
  gameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  gameName: { color: colors.targetText, fontSize: 17, fontWeight: '700' },
  gameStatus: { color: colors.targetText, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  gameDate: { color: '#4b5a73', fontSize: 13 },
  account: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  error: { color: colors.attention },
  input: { minHeight: 48, minWidth: 180, borderRadius: 8, borderWidth: 1, borderColor: '#3a4a66', backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, fontSize: 18, letterSpacing: 2 },
});
