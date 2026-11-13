import { colors } from '@firstpass/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MiniCourt } from '../../components/MiniCourt';
import { OnCourtStrip } from '../../components/OnCourtStrip';
import { Tiles } from '../../components/Tiles';
import { Btn, ui } from '../../components/ui';
import { lossesThisQuarter, onCourt } from '../../stats/markers';
import { buildModel } from '../../stats/possessions';
import { tiles } from '../../stats/tiles';
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
  // The figures change only when events do, not every clock tick.
  const glance = useMemo(() => {
    const model = buildModel(events);
    return { tiles: tiles(model), players: onCourt(model), losses: lossesThisQuarter(model), period: model.period };
  }, [events]);

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
      <ScrollView contentContainerStyle={styles.body}>
        <Score summary={summary} />
        {events.length === 0 ? (
          <Text style={[ui.muted, styles.centerText]}>Waiting for the first stats from the statistician's tablet.</Text>
        ) : (
          <View style={[styles.grid, wide && styles.gridWide]}>
            <View style={[styles.col, wide && styles.colWide]}>
              <Heading left="Conversions · this game" />
              <Tiles tiles={glance.tiles} />
            </View>
            <View style={[styles.col, wide && styles.colWide]}>
              <Heading left={`Where we lost it · Q${glance.period}`} right={`${glance.losses.length} lost`} />
              <MiniCourt losses={glance.losses} />
              <Heading left="On court" right={summary.names.us} />
              <OnCourtStrip players={glance.players} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Heading({ left, right }: { left: string; right?: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.headingLeft}>{left}</Text>
      {right ? <Text style={styles.headingRight}>{right}</Text> : null}
    </View>
  );
}

/** Score, quarter and clock in one band, with the quarter scores under it. */
function Score({ summary }: { summary: ScoreSummary }) {
  const playing = summary.phase === 'playing';
  return (
    <View
      style={styles.scoreBlock}
      accessible
      accessibilityLabel={`${summary.names.us} ${summary.score.us}, ${summary.names.them} ${summary.score.them}, ${summary.label}${playing ? ` ${summary.clock}` : ''}`}
    >
      <View style={styles.scoreRow}>
        <Text style={styles.team} numberOfLines={1}>
          {summary.names.us}
        </Text>
        <Text style={styles.score}>
          {summary.score.us}
          <Text style={styles.dash}> – </Text>
          {summary.score.them}
        </Text>
        <Text style={[styles.team, styles.teamRight]} numberOfLines={1}>
          {summary.names.them}
        </Text>
      </View>
      <View style={styles.clockRow}>
        <Text style={styles.period}>{summary.label}</Text>
        {playing ? <Text style={[styles.clock, !summary.running && styles.clockStopped]}>{summary.clock}</Text> : null}
        {playing && !summary.running ? <Text style={ui.muted}>stopped</Text> : null}
        {summary.centrePass ? <Text style={ui.muted}>· CP {summary.names[summary.centrePass]}</Text> : null}
      </View>
      {summary.quarters.length > 0 ? (
        <Text style={styles.quarters}>{summary.quarters.map((q) => `Q${q.period} ${q.us}–${q.them}`).join('   ')}</Text>
      ) : null}
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
  body: { padding: 16, paddingTop: 8, gap: 12 },
  grid: { gap: 4 },
  gridWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  col: { gap: 4 },
  colWide: { flex: 1, minWidth: 0 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12, marginBottom: 6, gap: 8 },
  headingLeft: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  headingRight: { color: colors.textMuted, fontSize: 13 },
  scoreBlock: { alignItems: 'center', gap: 4, paddingVertical: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, width: '100%' },
  team: { flex: 1, color: colors.textMuted, fontSize: 17, fontWeight: '700', textAlign: 'right' },
  teamRight: { textAlign: 'left' },
  score: { color: colors.text, fontSize: 48, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dash: { color: colors.textMuted, fontWeight: '400' },
  clockRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  period: { color: colors.text, fontSize: 20, fontWeight: '800' },
  clock: { color: colors.text, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  clockStopped: { color: colors.textMuted },
  quarters: { color: colors.textMuted, fontSize: 14, fontVariant: ['tabular-nums'] },
});
