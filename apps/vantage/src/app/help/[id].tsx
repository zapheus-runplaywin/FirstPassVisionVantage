import { lineupsAt, liveEvents, QUARTERS, type LiveEvent } from '@firstpass/engine';
import type { CorrectionPayload } from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { ImpactFeedbackStyle, impactAsync } from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ribbon } from '../../components/Panels';
import { EditSheet, StatsSheet, SubsSheet } from '../../components/Sheets';
import { Btn, fmtClock, Panel, s } from '../../components/ui';
import { describe } from '../../game/describe';
import { helperEvents } from '../../game/helperEvents';
import { useClock, useGame, type Game } from '../../game/useGame';
import { useRemote } from '../../lib/helper';
import { syncLabel, useSync } from '../../lib/sync';

/*
 * The helper's screen. A second statistician follows a game being recorded
 * on another tablet and does two jobs so the recorder can watch the play:
 * substitutions as they happen, and corrections to what was recorded. There
 * is no court and no clock control here: play, the clock and the quarters
 * belong to the recording tablet.
 */

type SheetState = { kind: 'edit'; event: LiveEvent } | { kind: 'subs' } | { kind: 'stats' };

export default function HelpScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = useGame(id);
  useKeepAwake();
  if (!game || game.ownStream === 'primary') {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={s.text}>{game ? 'This game is recorded on this tablet.' : 'This game is not on this device.'}</Text>
        <Btn label="Back" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }
  return <Help game={game} />;
}

function Help({ game }: { game: Game }) {
  const { config, state, append } = game;
  const clock = useClock(game)!;
  const sync = useSync(game.id, game.ownCount);
  const remote = useRemote(game.id, true);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const live = useMemo(() => liveEvents(game.events), [game.events]);
  const lineups = useMemo(() => lineupsAt(game.events), [game.events]);
  const lineup = state.lineup ?? {};
  const list = useMemo(() => helperEvents(live).reverse(), [live]);
  const fullTime = state.period >= QUARTERS && clock.inBreak;
  // HQ has said this tablet is no longer the helper (another took over, or the recorder turned it off).
  const stopped = sync.kind === 'refused';

  const correct = (c: CorrectionPayload) => {
    append('correction', c);
    void impactAsync(ImpactFeedbackStyle.Light);
  };
  const say = (e: LiveEvent) => describe(e, config, lineups.get(e.id) ?? lineup);

  const openSheet = sheet ? (
    sheet.kind === 'edit' ? (
      <EditSheet
        key={sheet.event.id}
        event={sheet.event}
        config={config}
        lineup={lineups.get(sheet.event.id) ?? lineup}
        title={`Edit · Q${sheet.event.payload.period} ${fmtClock(sheet.event.payload.clockMs)}`}
        onCorrect={correct}
        onClose={() => setSheet(null)}
      />
    ) : sheet.kind === 'subs' ? (
      <SubsSheet
        lineup={lineup}
        bench={game.bench}
        when={clock.inBreak ? `the start of Q${clock.period + 1}` : `Q${clock.period} ${fmtClock(clock.remainingMs)}`}
        onChange={(next, bench, detail) => {
          append('lineup_change', {
            // As on the recording tablet: in a break the change is for the start of the next quarter,
            // otherwise it is timed to the clock now.
            period: clock.inBreak ? clock.period + 1 : clock.period,
            clockMs: clock.inBreak ? config.quarterMs : clock.remainingMs,
            team: 'us',
            lineup: next,
            bench,
            detail,
          });
          void impactAsync(ImpactFeedbackStyle.Light);
        }}
        onClose={() => setSheet(null)}
      />
    ) : (
      <StatsSheet state={state} events={game.events} config={config} remainingMs={clock.inBreak ? undefined : clock.remainingMs} onClose={() => setSheet(null)} />
    )
  ) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <View style={styles.top}>
        <Text style={styles.badge}>HELPER</Text>
        <Text style={styles.q}>{fullTime ? 'Full time' : clock.inBreak ? `Q${clock.period} break` : `Q${clock.period}`}</Text>
        <Text style={styles.clock}>{fmtClock(clock.remainingMs)}</Text>
        <Text style={styles.score} numberOfLines={1}>
          {config.us} <Text style={styles.scoreN}>{state.score.us}</Text> – <Text style={styles.scoreN}>{state.score.them}</Text> {config.them}
        </Text>
        <View style={{ flex: 1 }} />
        <Text numberOfLines={2} style={[s.muted, styles.syncText, stopped && styles.warnText]}>
          {syncLabel(sync)}
        </Text>
        <Btn label="Stats" onPress={() => setSheet({ kind: 'stats' })} style={styles.topBtn} />
        <Btn label="Home" tone="quiet" onPress={() => router.replace('/')} style={styles.topBtn} />
      </View>
      {stopped ? (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>Your changes are not being saved</Text>
          <Text style={s.text}>
            {sync.message}. If another statistician took over or the helper was turned off, go Home and join again with the code when asked to.
          </Text>
        </View>
      ) : remote.stale ? (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>Not up to date</Text>
          <Text style={s.text}>This tablet can{"'"}t reach the club, so the latest events may be missing. It keeps trying.</Text>
        </View>
      ) : null}
      <View style={styles.main}>
        <View style={styles.left}>
          <ScrollView contentContainerStyle={styles.listInner}>
            <Ribbon
              events={list}
              amberIds={game.amberIds}
              describe={say}
              onEdit={(event) => setSheet({ kind: 'edit', event })}
              onDelete={(e) => correct({ target: e.id, op: 'delete' })}
              title="Recorded events"
              empty="Nothing recorded yet. Events appear here a few seconds after they are entered."
            />
          </ScrollView>
        </View>
        <View style={styles.right}>
          <ScrollView contentContainerStyle={styles.rightInner}>
            <Panel title="On court" hint="our team">
              {Object.entries(lineup).length === 0 ? <Text style={s.muted}>No lineup recorded</Text> : null}
              <View style={styles.lineup}>
                {(['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'] as const).map((p) => (
                  <View key={p} style={styles.player}>
                    <Text style={styles.pos}>{p}</Text>
                    <Text style={styles.name} numberOfLines={1}>
                      {lineup[p] ?? '–'}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={s.muted}>Bench: {game.bench.length ? game.bench.join(', ') : 'empty'}</Text>
            </Panel>
            <Btn label="Subs" tone="primary" big onPress={() => setSheet({ kind: 'subs' })} />
            <Text style={s.muted}>
              You do the substitutions and fix mistakes: tap an event to change it. {game.amberIds.size ? `${game.amberIds.size} marked amber still need a detail.` : ''} The
              recording tablet shows a note for each change you make.
            </Text>
          </ScrollView>
          {openSheet}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 8, gap: 8 },
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderColor: colors.surfaceLine,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badge: { color: colors.targetText, backgroundColor: colors.selected, fontSize: 13, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  q: { color: colors.text, fontSize: 18, fontWeight: '700' },
  clock: { color: colors.text, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  score: { color: colors.textMuted, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  scoreN: { color: colors.text },
  syncText: { flexShrink: 1, maxWidth: 320 },
  warnText: { color: colors.attention, fontWeight: '700' },
  topBtn: { minHeight: 44 },
  warn: { backgroundColor: '#3a1a08', borderColor: colors.attention, borderWidth: 2, borderRadius: 10, padding: 10, gap: 4 },
  warnTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  main: { flex: 1, flexDirection: 'row', gap: 8 },
  left: { flex: 3, minWidth: 0 },
  listInner: { paddingBottom: 8 },
  right: { flex: 2, minWidth: 300, position: 'relative' },
  rightInner: { gap: 8, paddingBottom: 8 },
  lineup: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: '45%', flexGrow: 1, backgroundColor: colors.target, borderRadius: 8, paddingHorizontal: 8, minHeight: 44 },
  pos: { color: colors.targetText, fontSize: 15, fontWeight: '800', minWidth: 30 },
  name: { color: colors.targetText, fontSize: 15, fontWeight: '600', flexShrink: 1 },
});
