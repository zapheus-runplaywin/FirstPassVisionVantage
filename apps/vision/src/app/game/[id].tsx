import { colors } from '@firstpass/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, ui } from '../../components/ui';
import { freshness, scoreSummary, type Freshness, type ScoreSummary } from '../../live/summary';
import { useLiveGame, useNow } from '../../live/useLiveGame';
import type { Connection } from '../../live/feed';

/** Two columns from this width: landscape phones and tablets. */
const TWO_COLUMNS = 700;

export default function LiveGame() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { game, feed, gameError } = useLiveGame(id);
  const now = useNow();
  const { width } = useWindowDimensions();
  const events = feed.log.events;
  const summary = useMemo(() => (game ? scoreSummary(game.config, events, now) : null), [game, events, now]);

  if (game === undefined && !gameError) {
    return (
      <SafeAreaView style={[ui.screen, styles.center]}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }
  if (!game || !summary) {
    return (
      <SafeAreaView style={[ui.screen, styles.center, styles.pad]}>
        <Text style={ui.body}>{gameError ?? "This game isn't one you can see. Ask your club admin to check you're a coach or manager of the team."}</Text>
        <Btn label="Back to games" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const fresh = freshness(feed, summary.running, now);
  const wide = width >= TWO_COLUMNS;

  return (
    <SafeAreaView style={ui.screen}>
      <View style={styles.top}>
        <Btn label="‹ Games" tone="quiet" onPress={() => router.back()} style={styles.back} />
        <View style={styles.grow} />
        <ConnectionChip connection={feed.connection} fresh={fresh} />
      </View>
      {fresh.kind !== 'fresh' ? <StaleBanner fresh={fresh} error={feed.error} /> : null}
      <ScrollView contentContainerStyle={[styles.body, wide && styles.bodyWide]}>
        <View style={[styles.main, wide && styles.mainWide]}>
          <Score summary={summary} big={wide} />
          {events.length === 0 ? (
            <Text style={[ui.muted, styles.centerText]}>Waiting for the first stats from the statistician's tablet.</Text>
          ) : null}
        </View>
        {summary.quarters.length > 0 ? (
          <View style={[styles.side, wide && styles.sideWide]}>
            <Quarters summary={summary} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Score({ summary, big }: { summary: ScoreSummary; big: boolean }) {
  const playing = summary.phase === 'playing';
  return (
    <View style={styles.scoreBlock} accessible accessibilityLabel={`${summary.names.us} ${summary.score.us}, ${summary.names.them} ${summary.score.them}, ${summary.label}`}>
      <View style={styles.scoreRow}>
        <Side name={summary.names.us} score={summary.score.us} big={big} />
        <Text style={[styles.dash, big && styles.dashBig]}>–</Text>
        <Side name={summary.names.them} score={summary.score.them} big={big} />
      </View>
      <View style={styles.clockRow}>
        <Text style={styles.period}>{summary.label}</Text>
        {playing ? <Text style={[styles.clock, !summary.running && styles.clockStopped]}>{summary.clock}</Text> : null}
      </View>
      {playing && !summary.running ? <Text style={ui.muted}>Clock stopped</Text> : null}
      {summary.centrePass ? <Text style={ui.muted}>Centre pass: {summary.names[summary.centrePass]}</Text> : null}
    </View>
  );
}

function Side({ name, score, big }: { name: string; score: number; big: boolean }) {
  return (
    <View style={styles.side1}>
      <Text style={styles.team} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.score, big && styles.scoreBig]}>{score}</Text>
    </View>
  );
}

function Quarters({ summary }: { summary: ScoreSummary }) {
  return (
    <View style={styles.table}>
      <View style={styles.tr}>
        <Text style={[styles.th, styles.qCol]}>Quarter</Text>
        <Text style={[styles.th, styles.num]} numberOfLines={1}>
          {summary.names.us}
        </Text>
        <Text style={[styles.th, styles.num]} numberOfLines={1}>
          {summary.names.them}
        </Text>
      </View>
      {summary.quarters.map((q) => (
        <View key={q.period} style={styles.tr}>
          <Text style={[styles.td, styles.qCol]}>Q{q.period}</Text>
          <Text style={[styles.td, styles.num]}>{q.us}</Text>
          <Text style={[styles.td, styles.num]}>{q.them}</Text>
        </View>
      ))}
    </View>
  );
}

function ConnectionChip({ connection, fresh }: { connection: Connection; fresh: Freshness }) {
  const label = connection === 'live' ? 'Live' : connection === 'polling' ? 'Checking every 5 s' : 'Connecting';
  return (
    <View style={styles.chip} accessible accessibilityLabel={`Connection: ${label}`}>
      <View style={[styles.dot, { backgroundColor: fresh.kind === 'fresh' ? colors.text : colors.attention }]} />
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function StaleBanner({ fresh, error }: { fresh: Exclude<Freshness, { kind: 'fresh' }>; error: string | null }) {
  const text =
    fresh.kind === 'quiet'
      ? `No new stats for ${fresh.seconds} s while the clock is running. The tablet may have lost signal.`
      : fresh.seconds === null
        ? `Can't reach the club's database yet.${error ? ` (${error})` : ''}`
        : `Can't reach the club's database. These numbers are from ${fresh.seconds} s ago.`;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  centerText: { textAlign: 'center' },
  pad: { padding: 24 },
  grow: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4 },
  back: { minHeight: 44, paddingHorizontal: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.surfaceLine,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  banner: { marginHorizontal: 12, marginTop: 8, padding: 12, borderRadius: 10, backgroundColor: colors.attention },
  bannerText: { color: '#000000', fontSize: 15, fontWeight: '700' },
  body: { padding: 16, gap: 24 },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start' },
  main: { gap: 16 },
  mainWide: { flex: 3 },
  side: {},
  sideWide: { flex: 2 },
  scoreBlock: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 12, width: '100%' },
  side1: { flex: 1, alignItems: 'center' },
  team: { color: colors.textMuted, fontSize: 18, fontWeight: '700' },
  score: { color: colors.text, fontSize: 72, fontWeight: '800', fontVariant: ['tabular-nums'] },
  scoreBig: { fontSize: 104 },
  dash: { color: colors.textMuted, fontSize: 48, paddingBottom: 14 },
  dashBig: { fontSize: 64, paddingBottom: 22 },
  clockRow: { flexDirection: 'row', alignItems: 'baseline', gap: 14 },
  period: { color: colors.text, fontSize: 26, fontWeight: '800' },
  clock: { color: colors.text, fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
  clockStopped: { color: colors.textMuted },
  table: { borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceLine, padding: 12, gap: 4 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  th: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  td: { color: colors.text, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  qCol: { flex: 1.2 },
  num: { flex: 1, textAlign: 'right' },
});
