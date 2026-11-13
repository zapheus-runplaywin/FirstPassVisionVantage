import { legalPositions, reboundKind, reboundLabel, rebounderChoices, reboundTeam, type GameState, type LiveEvent } from '@firstpass/engine';
import { CAUSES_LOST, CAUSES_WON, POSITIONS, type Action, type Cause, type EntryMode, type PlayerRef, type Rebound, type Team } from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { actionLook, ACTION_GRID, FULL_ONLY, type Pending } from '../game/entry';
import { shortName } from '../game/useGame';
import { Btn, fmtClock, Panel } from './ui';

export function WhoPanel({
  pending,
  lineup,
  bench,
  them,
  onPick,
}: {
  pending: Pending | null;
  lineup: Partial<Record<string, string>>;
  bench: string[];
  them: string;
  onPick: (team: Team, player: PlayerRef | null) => void;
}) {
  const legal = pending?.zone ? legalPositions(pending.zone) : null;
  return (
    <Panel title="Who" hint={legal ? 'legal here: ' + [...legal].join(', ') : undefined}>
      <View style={st.chips}>
        {[...POSITIONS, '?' as const].map((p) => {
          const selected = pending?.team === 'us' && pending.player === p;
          const off = p !== '?' && legal !== null && !legal.has(p);
          return (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityLabel={p === '?' ? 'Unknown player' : `${p} ${lineup[p] ?? ''}`}
              onPress={() => onPick('us', p)}
              style={[st.chip, off && st.chipOff, p === '?' && st.chipQ, selected && st.chipSel]}
            >
              <Text style={[st.chipPos, off && st.offText, p === '?' && st.qText, selected && st.selText]}>{p}</Text>
              <Text numberOfLines={1} style={[st.chipName, off && st.offText, selected && st.selText]}>
                {p === '?' ? 'who?' : shortName(lineup[p])}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={st.bench} numberOfLines={1}>
        Bench: {bench.length ? bench.join(' · ') : 'none'}
      </Text>
      <Btn label={`${them} (team)`} tone={pending?.team === 'them' ? 'selected' : 'target'} onPress={() => onPick('them', null)} style={st.opp} />
    </Panel>
  );
}

export function WhatPanel({
  pending,
  state,
  mode,
  teamName,
  names,
  onAction,
  onCause,
  onRebound,
  onRebounder,
  lineup,
  onSkip,
}: {
  pending: Pending | null;
  state: GameState;
  mode: EntryMode;
  teamName: string;
  /** Both teams' names, for the rebound buttons. */
  names: Record<Team, string>;
  onAction: (a: Action) => void;
  onCause: (c: Cause) => void;
  onRebound: (r: Rebound) => void;
  onRebounder: (p: PlayerRef) => void;
  /** Our lineup now, to name the rebounder buttons. */
  lineup: Partial<Record<string, string>>;
  onSkip: () => void;
}) {
  if (pending?.stage === 'cause') {
    const causes: readonly Cause[] = pending.action === 'Won it' ? CAUSES_WON : CAUSES_LOST;
    return (
      <Panel title="What" hint={`${pending.action}: how? (optional)`} style={st.prompt}>
        <View style={st.grid}>
          {causes.map((c) => (
            <Btn key={c} label={c} onPress={() => onCause(c)} style={st.cell} />
          ))}
        </View>
        <Btn label="Skip, fill at the break" tone="quiet" onPress={onSkip} />
      </Panel>
    );
  }
  if (pending?.stage === 'rebounder' && pending.rebound) {
    const kind = reboundKind(pending.rebound);
    const others = POSITIONS.filter((p) => !rebounderChoices(pending.rebound, pending.team ?? 'us').includes(p));
    return (
      <Panel title="What" hint={`${kind} ${names.us}: who took it? (optional)`} style={st.prompt}>
        <View style={st.grid}>
          {rebounderChoices(pending.rebound, pending.team ?? 'us').map((p) => (
            <Btn key={p} label={`${kind} ${p}`} big onPress={() => onRebounder(p)} style={st.half}>
              <Text style={st.rebKind}>{p}</Text>
              <Text style={st.rebTeam} numberOfLines={1}>
                {shortName(lineup[p]) || kind}
              </Text>
            </Btn>
          ))}
        </View>
        <View style={st.grid}>
          {[...others, '?' as const].map((p) => (
            <Btn key={p} label={p} onPress={() => onRebounder(p)} style={st.small} />
          ))}
        </View>
        <Btn label="Skip, fill at the break" tone="quiet" onPress={onSkip} />
      </Panel>
    );
  }
  if (pending?.stage === 'rebound') {
    return (
      <Panel title="What" hint="After the miss" style={st.prompt}>
        <View style={st.grid}>
          {(['ours', 'theirs', 'out'] as const).map((v) => {
            const shooter = pending.team ?? 'us';
            const team = reboundTeam(v, shooter);
            return (
              <Btn key={v} label={reboundLabel(v, shooter, names)} big onPress={() => onRebound(v)} style={st.cell}>
                <Text style={st.rebKind}>{reboundKind(v)}</Text>
                <Text style={st.rebTeam} numberOfLines={1}>
                  {team ? names[team] : 'of court'}
                </Text>
              </Btn>
            );
          })}
        </View>
        <Btn label="Skip, fill at the break" tone="quiet" onPress={onSkip} />
      </Panel>
    );
  }
  return (
    <Panel title="What" hint={pending?.team ? teamName : 'pick who first'}>
      <View style={st.grid}>
        {ACTION_GRID.map((a) => {
          const look = actionLook(a, pending, state, mode);
          const locked = FULL_ONLY.has(a) && mode !== 'full';
          return (
            <Btn
              key={a}
              label={a}
              big={['Goal', 'Miss', 'Won it', 'Lost it'].includes(a)}
              tone={look === 'dim' ? 'dim' : 'target'}
              disabled={locked || !pending?.team}
              onPress={() => onAction(a)}
              style={[st.cell, look === 'lit' && pending?.team === 'them' && st.themLit]}
            />
          );
        })}
      </View>
    </Panel>
  );
}

export function Ribbon({
  events,
  amberIds,
  describe,
  onEdit,
  onDelete,
}: {
  events: LiveEvent[];
  amberIds: ReadonlySet<string>;
  describe: (e: LiveEvent) => string;
  onEdit: (e: LiveEvent) => void;
  onDelete: (e: LiveEvent) => void;
}) {
  return (
    <Panel title="Last events" hint="tap to edit" style={st.ribbon}>
      {events.length === 0 ? <Text style={st.empty}>No events yet. Start the clock, then tap the court.</Text> : null}
      {events.map((e) => (
        <View key={e.id} style={st.row}>
          <Pressable accessibilityRole="button" onPress={() => onEdit(e)} style={st.rowMain}>
            <View style={[st.dot, amberIds.has(e.id) && st.amberDot]} />
            <Text style={st.time}>
              Q{e.payload.period} {fmtClock(e.payload.clockMs)}
            </Text>
            <Text style={st.rowText} numberOfLines={1}>
              {describe(e)}
            </Text>
          </Pressable>
          <Btn label="Delete" tone="quiet" onPress={() => onDelete(e)} style={st.del} />
        </View>
      ))}
    </Panel>
  );
}

export const st = StyleSheet.create({
  /** After-the-miss buttons: OREB or DREB big, the team that gets the ball small. */
  rebKind: { fontSize: 22, fontWeight: '800', color: colors.targetText, textAlign: 'center' },
  rebTeam: { fontSize: 13, fontWeight: '600', color: colors.targetText, opacity: 0.7, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { width: '10.5%', flexGrow: 1, minHeight: 56, borderRadius: 8, backgroundColor: colors.target, alignItems: 'center', justifyContent: 'center', padding: 2 },
  chipOff: { backgroundColor: colors.targetDim },
  chipQ: { backgroundColor: colors.targetDim },
  chipSel: { backgroundColor: colors.selected },
  chipPos: { fontSize: 18, fontWeight: '800', color: colors.ourTeam },
  chipName: { fontSize: 11, color: '#4b5a73' },
  offText: { color: colors.targetDimText },
  qText: { color: colors.text },
  selText: { color: colors.targetText },
  bench: { color: colors.textMuted, fontSize: 13 },
  opp: { minHeight: 52, borderWidth: 2, borderColor: colors.opposition },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '30%', flexGrow: 1 },
  half: { width: '45%', flexGrow: 1 },
  small: { minWidth: 52, flexGrow: 1, minHeight: 48 },
  themLit: { borderWidth: 2, borderColor: colors.opposition },
  prompt: { borderColor: colors.attention, borderWidth: 1.5 },
  ribbon: {},
  empty: { color: colors.textMuted, padding: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  amberDot: { backgroundColor: colors.selected },
  time: { color: colors.textMuted, fontVariant: ['tabular-nums'], minWidth: 64 },
  rowText: { color: colors.text, flex: 1, fontSize: 15 },
  del: { minHeight: 36, paddingHorizontal: 8 },
});
