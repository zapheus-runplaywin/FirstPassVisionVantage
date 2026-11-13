import { colors } from '@firstpass/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCard, NoCard } from '../../components/AlertCard';
import { BreakView } from '../../components/BreakView';
import { ChangesTab } from '../../components/ChangesTab';
import { CourtTab } from '../../components/CourtTab';
import { OnCourtTab } from '../../components/OnCourtTab';
import { MiniCourt } from '../../components/MiniCourt';
import { OnCourtStrip } from '../../components/OnCourtStrip';
import { Tiles } from '../../components/Tiles';
import { Btn, ui } from '../../components/ui';
import { useCardPrefs } from '../../live/useCardPrefs';
import { runAlerts, visibleLive } from '../../stats/alerts';
import { quarterLine, sayPoints } from '../../stats/breakview';
import { verdicts } from '../../stats/changes';
import { lossesThisQuarter, matchUps, onCourt } from '../../stats/markers';
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
    return {
      model,
      tiles: tiles(model),
      players: onCourt(model),
      matchUps: matchUps(model),
      verdicts: verdicts(model),
      losses: lossesThisQuarter(model),
      period: model.period,
    };
  }, [events]);
  const alerts = useMemo(() => runAlerts(events), [events]);
  const { prefs, toggleStar, dismiss } = useCardPrefs(id);
  const [tab, setTab] = useState<Tab>('live');
  // The break view opens by itself at each break; closing it keeps it closed for that break.
  const [closedBreak, setClosedBreak] = useState<string | null>(null);

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
  const live = visibleLive(alerts.live, prefs.muted, glance.period);
  const top = live[0];
  const inBreak = summary.phase === 'break' || summary.phase === 'full time';
  const breakKey = `${summary.phase}:${summary.period}`;
  const showBreak = inBreak && events.length > 0 && closedBreak !== breakKey;

  return (
    <SafeAreaView style={ui.screen}>
      <View style={styles.top}>
        <Btn label="‹ Games" tone="quiet" onPress={() => router.back()} style={styles.back} />
        <View style={styles.grow} />
        {inBreak && !showBreak && events.length > 0 ? (
          <Btn label="Break view" tone="dim" onPress={() => setClosedBreak(null)} style={styles.breakBtn} />
        ) : null}
        <ConnectionChip connection={feed.connection} fresh={fresh} />
      </View>
      {fresh.kind !== 'fresh' ? <StaleBanner fresh={fresh} error={feed.error} /> : null}
      <ScrollView contentContainerStyle={styles.body}>
        <Score summary={summary} />
        {events.length === 0 ? (
          <Text style={[ui.muted, styles.centerText]}>Waiting for the first stats from the statistician's tablet.</Text>
        ) : tab === 'court' ? (
          <CourtTab model={glance.model} names={summary.names} />
        ) : tab === 'oncourt' ? (
          <OnCourtTab rows={glance.matchUps} />
        ) : tab === 'changes' ? (
          <ChangesTab verdicts={glance.verdicts} names={summary.names} />
        ) : tab === 'alerts' ? (
          <View style={styles.alerts}>
            <Heading left="Alerts · this game" right={`${live.length} live · ${alerts.log.length} total`} />
            {alerts.log.length === 0 ? <Text style={ui.muted}>No cards yet this game.</Text> : null}
            {alerts.log.map((c) => {
              const dismissed = prefs.muted.get(c.subject) === c.period && c.retiredWhen === null;
              return (
                <AlertCard
                  key={c.id}
                  card={c}
                  starred={prefs.starred.has(c.id)}
                  onStar={() => toggleStar(c.id)}
                  onDismiss={dismissed ? undefined : () => dismiss(c.subject, glance.period)}
                />
              );
            })}
          </View>
        ) : (
          <View style={[styles.grid, wide && styles.gridWide]}>
            <View style={[styles.col, wide && styles.colWide]}>
              {top ? (
                <AlertCard card={top} starred={prefs.starred.has(top.id)} onStar={() => toggleStar(top.id)} onDismiss={() => dismiss(top.subject, glance.period)} />
              ) : (
                <NoCard />
              )}
              {live.length > 1 ? (
                <Pressable accessibilityRole="button" onPress={() => setTab('alerts')} style={styles.more}>
                  <Text style={styles.moreText}>
                    {live.length - 1} more live card{live.length > 2 ? 's' : ''} →
                  </Text>
                </Pressable>
              ) : null}
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
      <TabBar tab={tab} onTab={setTab} badge={live.length} />
      {showBreak ? (
        <BreakView
          period={summary.period}
          fullTime={summary.phase === 'full time'}
          names={summary.names}
          score={summary.score}
          quarter={quarterLine(glance.model, summary.period)}
          points={sayPoints(alerts.log, glance.model, summary.period)}
          lineup={glance.model.lineup}
          onClose={() => setClosedBreak(breakKey)}
        />
      ) : null}
    </SafeAreaView>
  );
}

type Tab = 'live' | 'court' | 'oncourt' | 'changes' | 'alerts';

const TABS: readonly (readonly [Tab, string])[] = [
  ['live', 'Live'],
  ['court', 'Court'],
  ['oncourt', 'On court'],
  ['changes', 'Changes'],
  ['alerts', 'Alerts'],
];

function TabBar({ tab, onTab, badge }: { tab: Tab; onTab: (t: Tab) => void; badge: number }) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {TABS.map(([t, label]) => (
        <Pressable
          key={t}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === t }}
          accessibilityLabel={t === 'alerts' && badge ? `${label}, ${badge} live` : label}
          onPress={() => onTab(t)}
          style={[styles.tab, tab === t && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{label}</Text>
          {t === 'alerts' && badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
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
  breakBtn: { minHeight: 40, paddingHorizontal: 12, marginRight: 8 },
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
  alerts: { gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  more: { paddingVertical: 8 },
  moreText: { color: colors.selected, fontSize: 14, fontWeight: '700' },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.surfaceLine },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, borderTopWidth: 3, borderTopColor: 'transparent', paddingHorizontal: 2 },
  tabOn: { borderTopColor: colors.selected },
  tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  tabTextOn: { color: colors.selected },
  badge: { backgroundColor: colors.attention, borderRadius: 999, minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, alignItems: 'center' },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: '800' },
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
