import { colors } from '@firstpass/ui';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, s } from '../components/ui';
import { gameStatus, type GameStatus } from '@firstpass/engine';
import { listGames, loadEvents, type SavedGame } from '../lib/db';

export default function Home() {
  const [games, setGames] = useState<(SavedGame & { status: GameStatus })[]>([]);
  useFocusEffect(useCallback(() => setGames(listGames().map((g) => ({ ...g, status: gameStatus(g.config, loadEvents(g.id)) }))), []));

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.wordmark}>
          <Text style={{ color: colors.text }}>First</Text>
          <Text style={{ color: colors.attention }}>Pass</Text>
          <Text style={{ color: colors.selected, fontSize: 22 }}> VANTAGE</Text>
        </Text>
        <Text style={s.muted}>Live stats entry. Games are saved on this device as you go, with or without signal.</Text>
        <Btn label="New game" tone="primary" big onPress={() => router.push('/setup')} style={styles.new} />
        {games.length ? <Text style={s.h2}>Saved games</Text> : null}
        {games.map((g) => (
          <Btn key={g.id} tone="target" onPress={() => router.push({ pathname: '/game/[id]', params: { id: g.id } })} style={styles.game}>
            <View style={styles.gameRow}>
              <Text style={styles.gameName}>
                {g.config.us} v {g.config.them}
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
  game: { alignItems: 'stretch' },
  gameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  gameName: { color: colors.targetText, fontSize: 17, fontWeight: '700' },
  gameStatus: { color: colors.targetText, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  gameDate: { color: '#4b5a73', fontSize: 13 },
});
