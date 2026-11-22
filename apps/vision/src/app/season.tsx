import { seasonPlayers, type SeasonPlayer } from '@firstpass/engine';
import { colors } from '@firstpass/ui';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chips } from '../components/Chips';
import { Btn, ui } from '../components/ui';
import { useSession } from '../lib/auth';
import { loadSeason, loadSeasonTeams, type LoadedSeason, type SeasonTeam } from '../lib/season';
import { ROUND_HEAD, SEASON_HEAD, SEASON_NOTE, extrasLine, roundRows, seasonRows } from '../stats/season';

/*
 * The season so far for one team: each athlete's figures added up over the
 * team's finished games, and one athlete's games round by round. For the
 * coaches and managers who already see each of those games. /season?team=<id>,
 * a plain page like /game, so the web version can serve it.
 */
export default function Season() {
  const { team = '' } = useLocalSearchParams<{ team?: string }>();
  const session = useSession();
  if (Platform.OS === 'web' && session === null) {
    return <Redirect href={{ pathname: '/', params: { next: team ? `/season?team=${encodeURIComponent(team)}` : '/season' } }} />;
  }
  if (session === undefined) {
    return (
      <SafeAreaView style={[ui.screen, s.center]}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }
  return <SignedInSeason team={team} />;
}

function back() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function SignedInSeason({ team }: { team: string }) {
  const [teams, setTeams] = useState<SeasonTeam[] | null>(null);
  const [season, setSeason] = useState<LoadedSeason | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const chosen = teams?.find((t) => t.id === team) ?? teams?.[0] ?? null;
  const chosenId = chosen?.id ?? null;

  useEffect(() => {
    loadSeasonTeams()
      .then(setTeams)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!chosenId) return;
    let current = true;
    setSeason(null);
    setProgress(null);
    setOpen(null);
    loadSeason(chosenId, (done, of) => current && setProgress([done, of]))
      .then((loaded) => current && setSeason(loaded))
      .catch((e: unknown) => current && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      current = false;
    };
  }, [chosenId]);

  const players = useMemo(() => (season ? seasonPlayers(season.games) : []), [season]);

  return (
    <SafeAreaView style={ui.screen}>
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.titleRow}>
          <Btn label="Games" tone="dim" onPress={back} style={s.small} />
          <Text style={[ui.h1, s.grow]} accessibilityRole="header">
            Season so far
          </Text>
        </View>
        {error ? <Text style={ui.error}>{error}</Text> : null}
        {teams === null && !error ? <ActivityIndicator color={colors.text} /> : null}
        {teams && teams.length === 0 ? (
          <Text style={ui.muted}>No finished games for your teams yet. Once a game recorded in Vantage reaches full time, its figures add up here.</Text>
        ) : null}
        {teams && teams.length > 1 && chosen ? (
          <Chips options={teams.map((t) => [t.id, t.name] as const)} value={chosen.id} onChange={(id) => router.setParams({ team: id })} />
        ) : null}
        {chosen && !season && !error ? (
          <Text style={ui.muted}>{progress ? `Reading game ${Math.min(progress[0] + 1, progress[1])} of ${progress[1]}…` : 'Finding the games…'}</Text>
        ) : null}
        {chosen && season ? (
          <>
            <Text style={ui.muted}>
              {chosen.name} · {season.games.length} finished {season.games.length === 1 ? 'game' : 'games'}
              {season.skipped ? ` · ${season.skipped} could not be opened` : ''}
            </Text>
            {players.length === 0 ? (
              <Text style={ui.muted}>
                No athlete is named in these games. The season view needs each game's lineup, with substitutions, to have been recorded in Vantage.
              </Text>
            ) : (
              <View>
                <Row cells={SEASON_HEAD} head />
                {seasonRows(players).map((cells, i) => {
                  const player = players[i] as SeasonPlayer;
                  const isOpen = open === player.name;
                  return (
                    <View key={player.name}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isOpen }}
                        accessibilityLabel={`${cells.join(', ')}. ${isOpen ? 'Hide' : 'Show'} each game`}
                        onPress={() => setOpen(isOpen ? null : player.name)}
                        style={({ pressed }) => pressed && ui.pressed}
                      >
                        <Row cells={cells} strong={isOpen} />
                      </Pressable>
                      {isOpen ? (
                        <View style={s.rounds}>
                          <Row cells={ROUND_HEAD} head />
                          {roundRows(player).map((r, j) => (
                            <Row key={j} cells={r} strong={r[0] === 'Season'} />
                          ))}
                          {extrasLine(player.total) ? <Text style={s.extras}>{extrasLine(player.total)}</Text> : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
            <Text style={s.hint}>
              Tap an athlete for each game. The figures are the ones in each game's report, added up. An athlete counts only while the lineup named
              them, so a game with no lineup adds nothing. Net Pts per 10 min lets athletes with different court time be read side by side; it shows
              from 5 minutes on court.
            </Text>
            <Text style={s.hint}>{SEASON_NOTE}</Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ cells, head, strong }: { cells: string[]; head?: boolean; strong?: boolean }) {
  return (
    <View style={[s.row, head && s.headRow]}>
      {cells.map((c, i) => (
        <Text key={i} style={[s.cell, i === 0 ? s.first : s.number, head && s.head, strong && s.strong]} numberOfLines={2}>
          {c}
        </Text>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  page: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 20, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  small: { minHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceLine },
  headRow: { paddingVertical: 4 },
  cell: { color: colors.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  first: { flex: 2, minWidth: 0 },
  number: { flex: 1, textAlign: 'right' },
  head: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  strong: { fontWeight: '800' },
  rounds: { paddingLeft: 12, paddingBottom: 10, borderLeftWidth: 2, borderLeftColor: colors.surfaceLine, marginBottom: 6 },
  extras: { color: colors.textMuted, fontSize: 13, paddingTop: 8 },
  hint: { color: colors.textMuted, fontSize: 14 },
});
