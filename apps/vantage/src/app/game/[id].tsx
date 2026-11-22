import { weRebounded, lineupsAt, liveEvents, nextPeriodDefaults, QUARTERS, resumableEnd, setClockEvent, timingRows, toAttackPoint, zoneOf, type LiveEvent, type ReviewIssue } from '@firstpass/engine';
import type { Action, Cause, CorrectionPayload, CourtEnd, CourtPoint, EntryMode, PlayerRef, Position, Rebound, Team } from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { ImpactFeedbackStyle, impactAsync } from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Court } from '../../components/Court';
import { KeyCatcher } from '../../components/KeyCatcher';
import { KeysSheet } from '../../components/KeysSheet';
import { Ribbon, WhatPanel, WhoPanel } from '../../components/Panels';
import { ClockSheet, EditSheet, ExportSheet, HelperSheet, StatsSheet, SubsSheet } from '../../components/Sheets';
import { Btn, fmtClock, Panel, s, Seg } from '../../components/ui';
import { deckKeys, deckPress, END_CONFIRM_MS } from '../../game/deck';
import { describe } from '../../game/describe';
import { emptyPending, type Pending } from '../../game/entry';
import { keyboardKeyId } from '../../game/keyboard';
import { helperNotes, unseenNotes } from '../../game/helperNotes';
import { STARTING_LINEUP } from '../../game/newGame';
import { useClock, useGame, type Game } from '../../game/useGame';
import { getGame } from '../../lib/db';
import { deckWanted, useDeck } from '../../lib/deck';
import { setHelper, useRemote } from '../../lib/helper';
import { keyboardWanted } from '../../lib/keyboard';
import { syncLabel, useSync } from '../../lib/sync';
import { useVenue, venueLabel } from '../../lib/venue';

type SheetState = { kind: 'edit'; event: LiveEvent } | { kind: 'subs' } | { kind: 'stats' } | { kind: 'export' } | { kind: 'clock' } | { kind: 'helper' } | { kind: 'keys' };

/** How long a note about a helper's change stays up before it clears itself. */
const NOTE_MS = 12_000;

/** Events the statistician entered and can see, edit or undo in the ribbon. */
function ribbonEvents(events: LiveEvent[]): LiveEvent[] {
  return events.filter(
    (e) => e.type === 'action' || e.type === 'flag' || (e.type === 'lineup_change' && e.payload.detail !== STARTING_LINEUP),
  );
}

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = useGame(id);
  useKeepAwake();
  if (!game) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={s.text}>This game is not on this device.</Text>
        <Btn label="Back" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }
  if (game.ownStream !== 'primary') {
    // A game this tablet is helping with has its own screen.
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={s.text}>You are helping with this game, not recording it.</Text>
        <Btn label="Open the helper screen" tone="primary" onPress={() => router.replace({ pathname: '/help/[id]', params: { id } })} />
        <Btn label="Back" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }
  return <Entry game={game} />;
}

function Entry({ game }: { game: Game }) {
  const { config, state, append } = game;
  const clock = useClock(game)!;
  const { width, height } = useWindowDimensions();
  // Phones in landscape: keep the top strip to one line so the court gets the height.
  const compact = width < 1000;
  const [pending, setPending] = useState<Pending | null>(null);
  const sync = useSync(game.id, game.ownCount);
  // The venue link: each event also goes straight to Studio on the venue's network, when this tablet is connected to one.
  const venue = venueLabel(useVenue(game.id, game.ownCount));
  const pairCode = sync.kind === 'synced' || sync.kind === 'queued' ? getGame(game.id)?.pairCode : null;
  const [sheet, setSheet] = useState<SheetState | null>(null);

  // The helper: a second statistician doing subs and corrections. While it is on, this tablet
  // reads their changes every few seconds and says what each one was.
  const [helperOn, setHelperOn] = useState(() => getGame(game.id)?.helperOn ?? false);
  const [helperError, setHelperError] = useState<string | null>(null);
  const [helperBusy, setHelperBusy] = useState(false);
  useRemote(game.id, helperOn);
  const notes = useMemo(() => helperNotes(game.events, config), [game.events, config]);
  // Changes already on the tablet when the game was opened are not announced again.
  const seen = useRef<Set<string> | null>(null);
  if (!seen.current) seen.current = new Set(notes.map((n) => n.id));
  const [, redraw] = useState(0);
  const fresh = unseenNotes(notes, seen.current);
  const dismissNotes = useCallback(() => {
    for (const n of notes) seen.current?.add(n.id);
    redraw((n) => n + 1);
  }, [notes]);
  const freshCount = fresh.length;
  useEffect(() => {
    if (!freshCount) return;
    const t = setTimeout(dismissNotes, NOTE_MS);
    return () => clearTimeout(t);
  }, [freshCount, dismissNotes]);
  const toggleHelper = () => {
    setHelperBusy(true);
    setHelperError(null);
    setHelper(game.id, !helperOn)
      .then(
        () => setHelperOn(!helperOn),
        (e: unknown) => setHelperError(e instanceof Error ? e.message : 'Could not change the helper'),
      )
      .finally(() => setHelperBusy(false));
  };
  const noteStrip = freshCount ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Helper changes, tap to clear" onPress={dismissNotes} style={styles.noteStrip}>
      <Text style={styles.noteText} numberOfLines={2}>
        {fresh[fresh.length - 1]?.text}
        {freshCount > 1 ? `   (+${freshCount - 1} more, see Helper)` : ''}
      </Text>
      <Text style={styles.noteClear}>Tap to clear</Text>
    </Pressable>
  ) : null;
  const live = useMemo(() => liveEvents(game.events), [game.events]);
  // Who was in each position when each action happened, so names stay right after subs.
  const lineups = useMemo(() => lineupsAt(game.events), [game.events]);
  const lineup = state.lineup ?? {};

  const commit = useCallback(
    (p: Pending) => {
      setPending(null);
      if (!p.team || !p.action) return;
      append('action', {
        period: clock.period,
        clockMs: clock.remainingMs,
        team: p.team,
        player: p.team === 'them' ? null : p.player,
        action: p.action,
        ...(p.cause ? { cause: p.cause } : {}),
        ...(p.rebound ? { rebound: p.rebound } : {}),
        ...(p.rebounder ? { rebounder: p.rebounder } : {}),
        ...(p.at ? { at: p.at } : {}),
      });
      void impactAsync(ImpactFeedbackStyle.Light);
    },
    [append, clock.period, clock.remainingMs],
  );

  /** A tap elsewhere while the optional second tap is showing skips it; the event gets an amber dot. */
  const settle = () => {
    if (pending && (pending.stage === 'cause' || pending.stage === 'rebound' || pending.stage === 'rebounder')) {
      commit(pending);
      return null;
    }
    return pending;
  };

  const onCourtTap = (screen: CourtPoint) => {
    settle();
    const at = toAttackPoint(screen, state.attackEnd);
    setPending({ ...emptyPending(), at, zone: zoneOf(at), screen });
  };
  const onPick = (team: Team, player: PlayerRef | null) => {
    const base = settle() ?? emptyPending();
    setPending({ ...base, team, player, stage: 'what' });
  };
  const onAction = (action: Action) => {
    if (!pending) return;
    const p = { ...pending, action };
    if (action === 'Won it' || action === 'Lost it') setPending({ ...p, stage: 'cause' });
    else if (action === 'Miss') setPending({ ...p, stage: 'rebound' });
    else commit(p);
  };
  const onCause = (cause: Cause) => {
    if (pending) commit({ ...pending, cause });
  };
  const onRebound = (rebound: Rebound) => {
    if (!pending) return;
    // When we got the ball back, a second tap says who took it (optional).
    if (weRebounded(rebound, pending.team ?? 'us')) setPending({ ...pending, rebound, stage: 'rebounder' });
    else commit({ ...pending, rebound });
  };
  const onRebounder = (rebounder: PlayerRef) => {
    if (pending) commit({ ...pending, rebounder });
  };

  const correct = (c: CorrectionPayload) => {
    append('correction', c);
    void impactAsync(ImpactFeedbackStyle.Light);
  };
  const undo = () => {
    if (pending) return setPending(null);
    // Undo takes back the last thing entered on this tablet, never a helper's substitution.
    const last = ribbonEvents(live)
      .filter((e) => e.stream === game.ownStream)
      .at(-1);
    if (last) correct({ target: last.id, op: 'delete' });
  };
  const flag = () => {
    append('flag', { period: clock.period, clockMs: clock.remainingMs, ...(pending?.at ? { at: pending.at } : {}) });
    setPending(null);
    void impactAsync(ImpactFeedbackStyle.Medium);
  };
  const startStop = () => {
    if (clock.running) append('clock_stop', { period: clock.period, clockMs: clock.remainingMs });
    else append('clock_start', { period: clock.period, clockMs: clock.remainingMs });
  };
  const endQuarter = useCallback(() => {
    if (clock.running) append('clock_stop', { period: clock.period, clockMs: clock.remainingMs });
    append('period_end', { period: clock.period, clockMs: clock.remainingMs });
    setPending(null);
    setSheet(null);
  }, [append, clock.period, clock.remainingMs, clock.running]);

  // At 0:00 the clock stops but the quarter stays open: the official clock may be a little
  // behind, and the last events still go in. The statistician ends the quarter.
  const timeUp = clock.remainingMs <= 0;
  useEffect(() => {
    if (clock.running && timeUp) {
      append('clock_stop', { period: clock.period, clockMs: 0 });
      void impactAsync(ImpactFeedbackStyle.Heavy);
    }
  }, [append, clock.period, clock.running, timeUp]);

  // Stream Deck keys (game/deck.ts): the same Who, What and detail buttons as the screen, pressed
  // on a Stream Deck XL beside the Mac. End quarter takes two presses, because a key is easier to
  // hit by accident than a button on the screen.
  const [deckOn] = useState(deckWanted);
  const [endArmed, setEndArmed] = useState(false);
  useEffect(() => {
    if (!endArmed) return;
    const t = setTimeout(() => setEndArmed(false), END_CONFIRM_MS);
    return () => clearTimeout(t);
  }, [endArmed]);
  const keys = deckKeys({
    pending,
    state,
    lineup,
    names: { us: config.us, them: config.them },
    period: clock.period,
    clockText: fmtClock(clock.remainingMs),
    running: clock.running,
    timeUp,
    inBreak: clock.inBreak,
    endArmed,
  });
  // Keyboard shortcuts (game/keyboard.ts) press the same keys: the keyboard's four rows are the
  // deck's four rows.
  const [keyboardOn] = useState(keyboardWanted);
  const pressKey = (id: string) => {
    const press = deckPress(id, keys);
    if (!press) return;
    if (press.kind !== 'endQuarter') setEndArmed(false);
    switch (press.kind) {
      case 'pick':
        return onPick(press.team, press.player);
      case 'action':
        return onAction(press.action);
      case 'cause':
        return onCause(press.cause);
      case 'rebound':
        return onRebound(press.rebound);
      case 'rebounder':
        return onRebounder(press.player);
      case 'skip':
        if (pending) commit(pending);
        return;
      case 'flag':
        return flag();
      case 'undo':
        return undo();
      case 'clock':
        return startStop();
      case 'endQuarter':
        if (!endArmed) return setEndArmed(true);
        setEndArmed(false);
        return endQuarter();
    }
  };
  const deck = useDeck(deckOn, keys, pressKey);
  const keyCatcher = keyboardOn ? (
    <KeyCatcher
      active={!sheet || sheet.kind === 'keys'}
      onKey={(typed) => {
        const id = keyboardKeyId(typed, keys);
        if (id) pressKey(id);
      }}
    />
  ) : null;

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
        onChange={(next, bench, detail) =>
          append('lineup_change', {
            // In a break the change is for the start of the next quarter; otherwise it is timed
            // to the clock now, running or stopped (an injury sub with the clock stopped).
            period: clock.inBreak ? clock.period + 1 : clock.period,
            clockMs: clock.inBreak ? config.quarterMs : clock.remainingMs,
            team: 'us',
            lineup: next,
            bench,
            detail,
          })
        }
        onClose={() => setSheet(null)}
      />
    ) : sheet.kind === 'clock' ? (
      <ClockSheet
        period={clock.period}
        remainingMs={clock.remainingMs}
        quarterMs={config.quarterMs}
        running={clock.running}
        onSet={(ms) => {
          const e = setClockEvent(clock, ms, config.quarterMs);
          append(e.type, e.payload);
        }}
        onClose={() => setSheet(null)}
      />
    ) : sheet.kind === 'stats' ? (
      <StatsSheet
        state={state}
        events={game.events}
        config={config}
        remainingMs={clock.inBreak ? undefined : clock.remainingMs}
        onClose={() => setSheet(null)}
      />
    ) : sheet.kind === 'keys' ? (
      <KeysSheet keys={keys} onClose={() => setSheet(null)} />
    ) : sheet.kind === 'helper' ? (
      <HelperSheet
        on={helperOn}
        busy={helperBusy}
        pairCode={getGame(game.id)?.pairCode ?? null}
        error={helperError}
        notes={notes}
        onToggle={toggleHelper}
        onClose={() => setSheet(null)}
      />
    ) : (
      <ExportSheet gameId={game.id} config={config} events={game.events} onClose={() => setSheet(null)} />
    )
  ) : null;

  if (clock.inBreak) {
    return <BreakReview game={game} live={live} say={say} sheet={openSheet} onSheet={setSheet} noteStrip={noteStrip} helperOn={helperOn} />;
  }

  const amberCount = game.amberIds.size;
  const latestAmber = live.filter((e) => game.amberIds.has(e.id)).at(-1);
  const teamName = pending?.team === 'them' ? config.them : pending?.team === 'us' ? `${config.us} ${pending.player ?? ''}` : '';
  const hint = !pending
    ? 'Tap where it happened'
    : pending.stage === 'who'
      ? 'Now tap who'
      : pending.stage === 'what'
        ? 'Now tap what'
        : 'Optional detail, or tap the court for the next event';

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <View style={styles.top}>
        {!compact ? (
          <Text style={styles.wordmark}>
            <Text style={{ color: colors.text }}>First</Text>
            <Text style={{ color: colors.attention }}>Pass</Text>
          </Text>
        ) : null}
        <Text style={styles.q}>Q{clock.period}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Game clock, tap to set" onPress={() => setSheet({ kind: 'clock' })} style={styles.clockBtn}>
          <Text style={[styles.clock, compact && styles.clockCompact, timeUp && styles.clockUp]}>{fmtClock(clock.remainingMs)}</Text>
        </Pressable>
        <Btn label={clock.running ? 'Stop' : 'Start'} tone={clock.running ? 'target' : 'primary'} onPress={startStop} style={styles.topBtn} />
        <Text style={styles.score} numberOfLines={1}>
          {compact ? '' : `${config.us} `}<Text style={styles.scoreN}>{state.score.us}</Text> – <Text style={styles.scoreN}>{state.score.them}</Text>
          {compact ? '' : ` ${config.them}`}
        </Text>
        <Pill label={compact ? 'CP' : 'Next CP'} value={state.nextCentrePass === 'us' ? config.us : config.them} />
        <Pill label="Ball" value={state.possession ? (state.possession === 'us' ? config.us : config.them) : state.centrePassPending ? 'CP next' : '–'} />
        {amberCount ? (
          <Btn label={`${amberCount} to fill`} tone="selected" onPress={() => latestAmber && setSheet({ kind: 'edit', event: latestAmber })} style={styles.topBtn} />
        ) : null}
        <View style={{ flex: 1 }} />
        {deck !== 'off' ? <Pill label="Stream Deck" value={deck === 'connected' ? 'on' : 'not found'} /> : null}
        {keyboardOn ? <Btn label="Keys" tone={sheet?.kind === 'keys' ? 'selected' : 'target'} onPress={() => setSheet(sheet?.kind === 'keys' ? null : { kind: 'keys' })} style={styles.topBtn} /> : null}
        {venue ? <Pill label="Venue link" value={venue.replace('Studio: ', '')} /> : null}
        {pairCode ? <Pill label="Pair code" value={`${pairCode.slice(0, 3)} ${pairCode.slice(3)}`} /> : null}
        {!compact || sync.kind === 'lease lost' || sync.kind === 'refused' || sync.kind === 'offline' ? (
          <Text numberOfLines={2} style={[s.muted, styles.syncText, (sync.kind === 'lease lost' || sync.kind === 'refused') && styles.warnText]}>
            {syncLabel(sync)}
          </Text>
        ) : null}
        <Btn label={helperOn ? 'Helper on' : 'Helper'} tone={helperOn ? 'selected' : 'target'} onPress={() => setSheet({ kind: 'helper' })} style={styles.topBtn} />
        <Btn label="Stats" onPress={() => setSheet({ kind: 'stats' })} style={styles.topBtn} />
        <Btn label={compact ? 'End Q' : 'End quarter'} tone={timeUp ? 'primary' : 'target'} onPress={endQuarter} style={styles.topBtn} />
      </View>
      {noteStrip}
      <View style={styles.main}>
        <View style={styles.left}>
          <Panel title="Where" hint={hint} style={styles.courtPanel}>
            <Court attackEnd={state.attackEnd} dot={pending?.screen ?? null} onTap={onCourtTap} />
            <Text style={s.muted}>
              {state.attackEnd === 'right' ? 'Attacking right' : 'Attacking left'} this quarter
              {pending?.zone ? `   ·   Tap: ${pending.zone.label}` : ''}
            </Text>
          </Panel>
          <Ribbon
            events={ribbonEvents(live).slice(height < 500 ? -2 : -5).reverse()}
            amberIds={game.amberIds}
            describe={say}
            onEdit={(event) => setSheet({ kind: 'edit', event })}
            onDelete={(e) => correct({ target: e.id, op: 'delete' })}
          />
        </View>
        <View style={styles.right}>
          <ScrollView contentContainerStyle={styles.rightInner}>
            <WhoPanel pending={pending} lineup={lineup} bench={game.bench} them={config.them} onPick={onPick} />
            <WhatPanel
              pending={pending}
              state={state}
              mode={state.mode}
              teamName={teamName}
              names={{ us: config.us, them: config.them }}
              onAction={onAction}
              onCause={onCause}
              onRebound={onRebound}
              onRebounder={onRebounder}
              lineup={lineup}
              onSkip={() => {
                if (pending) commit(pending);
              }}
            />
            <View style={styles.row2}>
              <Btn label="Undo" big onPress={undo} style={styles.flex} />
              <Btn label="Flag" big tone="primary" onPress={flag} style={styles.flex} />
            </View>
            <View style={styles.row2}>
              <Btn label="Subs" onPress={() => setSheet({ kind: 'subs' })} style={styles.flex} />
              <Btn label="Export" onPress={() => setSheet({ kind: 'export' })} style={styles.flex} />
            </View>
          </ScrollView>
          {openSheet}
        </View>
      </View>
      {keyCatcher}
    </SafeAreaView>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.pill}>
      <Text style={s.muted}>{label}</Text>
      <Text style={styles.pillValue}>{value}</Text>
    </View>
  );
}

function issueText(i: ReviewIssue, say: (e: LiveEvent) => string, config: Game['config']): string {
  const team = (t: Team) => (t === 'us' ? config.us : config.them);
  switch (i.kind) {
    case 'flag':
      return say(i.event);
    case 'amber':
      return `${say(i.event)} · ${i.reasons.join(', ')}`;
    case 'double turnover':
      return `Two turnovers in a row by ${team(i.team)} · a missed possession change?`;
    case 'double receive':
      return `Two centre pass receives in a row by ${team(i.team)} · a missed goal?`;
    case 'long gap':
      return `No event for ${Math.round(i.gapMs / 1000)} s before this one`;
  }
}

function BreakReview({
  game,
  live,
  say,
  sheet,
  onSheet,
  noteStrip,
  helperOn,
}: {
  game: Game;
  live: LiveEvent[];
  say: (e: LiveEvent) => string;
  sheet: ReactNode;
  onSheet: (s: SheetState) => void;
  /** What the helper just changed, if anything. */
  noteStrip: ReactNode;
  helperOn: boolean;
}) {
  const { config, state, append } = game;
  const defaults = nextPeriodDefaults(state);
  const [end, setEnd] = useState<CourtEnd>(defaults.attackEnd);
  const [cp, setCp] = useState<Team>(defaults.centrePass);
  const [mode, setMode] = useState<EntryMode>(state.mode);
  const fullTime = state.period >= QUARTERS;
  // Seconds from the first clock start, to find each issue in the game video.
  // Issues are always about events recorded on this tablet, so the rows are looked up by the primary stream's own
  // numbers: a helper's substitutions (numbered in their own stream) are left out, their corrections kept.
  const videoAt = useMemo(
    () =>
      new Map(
        timingRows(config, game.events.filter((e) => e.stream === 'primary' || e.type === 'correction')).map((r) => [r.seq, r.sinceStartS]),
      ),
    [config, game.events],
  );
  const q = state.quarters[state.period];
  const actionsThisQuarter = live.filter((e) => e.type === 'action' && e.payload.period === state.period).length;
  const other = <T extends string>(v: T, a: T, b: T) => (v === a ? b : a);

  const resumeId = resumableEnd(game.events);
  const resume = () => resumeId && append('correction', { target: resumeId, op: 'delete' });

  const startNext = () =>
    append('period_start', { period: defaults.period, clockMs: config.quarterMs, attackEnd: end, centrePass: cp, mode });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.breakWrap}>
        <ScrollView contentContainerStyle={styles.breakInner}>
          <Text style={s.h1}>{fullTime ? 'Full time' : `End of Q${state.period}`}</Text>
          {noteStrip}
          <Panel>
            <Text style={styles.breakScore}>
              {config.us} {state.score.us} – {state.score.them} {config.them}
            </Text>
            <Text style={s.muted}>
              Q{state.period}: {q ? `${q.us}–${q.them}` : '0–0'} · {actionsThisQuarter} {actionsThisQuarter === 1 ? "event" : "events"} this quarter
            </Text>
          </Panel>
          {!fullTime ? (
            <>
              <Text style={s.h2}>Next quarter check</Text>
              <Panel style={styles.flipRow}>
                <View>
                  <Text style={s.muted}>Direction</Text>
                  <Text style={styles.flipValue}>Q{defaults.period}: we attack {end}</Text>
                </View>
                <Btn label="Flip" onPress={() => setEnd(other(end, 'left', 'right'))} />
              </Panel>
              <Panel style={styles.flipRow}>
                <View>
                  <Text style={s.muted}>Centre pass</Text>
                  <Text style={styles.flipValue}>{cp === 'us' ? config.us : config.them} take it</Text>
                </View>
                <Btn label="Flip" onPress={() => setCp(other(cp, 'us', 'them'))} />
              </Panel>
            </>
          ) : null}
          <Text style={s.h2}>{fullTime ? 'Post-game audit' : 'To check'}</Text>
          {fullTime ? (
            <Text style={s.muted}>
              Everything to check from all four quarters. The video time counts from the first clock start: add it to where the scoring clock starts in the
              footage.
            </Text>
          ) : null}
          <Panel>
            {game.issues.length === 0 ? <Text style={styles.ok}>Nothing to check.</Text> : null}
            {game.issues.map((i, n) => (
              <View key={`${i.kind}-${i.event.id}-${n}`} style={styles.issue}>
                <View>
                  <Text style={styles.issueWhen}>
                    Q{i.event.payload.period} {fmtClock(i.event.payload.clockMs)}
                  </Text>
                  {fullTime && videoAt.has(i.event.seq) ? <Text style={styles.issueVideo}>video {fmtClock((videoAt.get(i.event.seq) ?? 0) * 1000)}</Text> : null}
                </View>
                <Text style={[s.text, styles.flex]}>{issueText(i, say, config)}</Text>
                <Btn label="Fix" onPress={() => onSheet({ kind: 'edit', event: i.event })} style={styles.fix} />
              </View>
            ))}
          </Panel>
          {!fullTime ? (
            <>
              <Text style={s.h2}>Mode for next quarter</Text>
              <Seg value={mode} onChange={setMode} options={[['core', 'Core'], ['full', 'Full Net Points']]} />
            </>
          ) : null}
          <View style={styles.breakActions}>
            {!fullTime ? <Btn label="Start next quarter" tone="primary" big onPress={startNext} /> : null}
            <Btn label="Subs" onPress={() => onSheet({ kind: 'subs' })} />
            <Btn label={helperOn ? 'Helper on' : 'Helper'} tone={helperOn ? 'selected' : 'target'} onPress={() => onSheet({ kind: 'helper' })} />
            <Btn label="Stats" onPress={() => onSheet({ kind: 'stats' })} />
            {resumeId ? <Btn label={`Back to Q${state.period}`} onPress={resume} /> : null}
            <Btn label="Export log" onPress={() => onSheet({ kind: 'export' })} />
            <Btn label="Home" onPress={() => router.replace('/')} />
          </View>
        </ScrollView>
        {sheet ? <View style={styles.breakSheet}>{sheet}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 8 },
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderColor: colors.surfaceLine,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  noteStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#3a1a08',
    borderColor: colors.attention,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    minHeight: 48,
  },
  noteText: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  noteClear: { color: colors.textMuted, fontSize: 13 },
  wordmark: { fontSize: 15, fontWeight: '800', fontStyle: 'italic' },
  q: { color: colors.text, fontSize: 18, fontWeight: '700' },
  clock: { color: colors.text, fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 84, textAlign: 'center' },
  clockCompact: { fontSize: 22, minWidth: 64 },
  warnText: { color: colors.attention, fontWeight: '700' },
  syncText: { flexShrink: 1, maxWidth: 320 },
  clockBtn: { borderRadius: 8, borderWidth: 1, borderColor: colors.surfaceLine, paddingHorizontal: 6, minHeight: 44, justifyContent: 'center' },
  clockUp: { color: colors.attention },
  topBtn: { minHeight: 44 },
  score: { color: colors.textMuted, fontSize: 17, fontWeight: '700' },
  scoreN: { color: colors.text },
  pill: { flexDirection: 'row', gap: 6, alignItems: 'center', borderColor: colors.surfaceLine, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillValue: { color: colors.text, fontWeight: '700', fontSize: 13 },
  main: { flex: 1, flexDirection: 'row', gap: 8 },
  left: { flex: 2, gap: 8, minWidth: 0 },
  courtPanel: { flex: 1 },
  right: { flex: 1, minWidth: 300, position: 'relative' },
  rightInner: { gap: 8, paddingBottom: 8 },
  row2: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  breakWrap: { flex: 1, flexDirection: 'row', gap: 8 },
  breakInner: { gap: 10, padding: 8, maxWidth: 900, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  breakSheet: { width: '42%', minWidth: 320, position: 'relative' },
  breakScore: { color: colors.text, fontSize: 20, fontWeight: '700' },
  flipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flipValue: { color: colors.selected, fontSize: 18, fontWeight: '700' },
  ok: { color: '#5fd38d', fontWeight: '600' },
  issue: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomColor: colors.surfaceLine, borderBottomWidth: 1 },
  issueWhen: { color: colors.textMuted, fontVariant: ['tabular-nums'], minWidth: 72 },
  issueVideo: { color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  fix: { minHeight: 44 },
  breakActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
});
