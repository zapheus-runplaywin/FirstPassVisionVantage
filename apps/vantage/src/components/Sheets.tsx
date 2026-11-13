import { courtTime, netPoints, timingRows, timingTable, type GameState, type LiveEvent } from '@firstpass/engine';
import {
  ACTIONS,
  CAUSES_LOST,
  CAUSES_WON,
  POSITIONS,
  type ActionPayload,
  type CorrectionPayload,
  type GameConfig,
  type GameEvent,
  type PlayerRef,
  type Position,
  type Rebound,
} from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { setStringAsync } from 'expo-clipboard';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { shortName } from '../game/useGame';
import { Btn, fmtClock, s } from './ui';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <View style={sh.sheet}>
      <View style={sh.head}>
        <Text style={sh.title}>{title}</Text>
        <Btn label="Close" tone="quiet" onPress={onClose} style={sh.close} />
      </View>
      <ScrollView contentContainerStyle={sh.body}>{children}</ScrollView>
    </View>
  );
}

function Choice<T extends string>({ items, value, label, onPick }: { items: readonly T[]; value: T | null | undefined; label?: (v: T) => string; onPick: (v: T) => void }) {
  return (
    <View style={sh.choices}>
      {items.map((v) => (
        <Btn key={v} label={label ? label(v) : v} tone={v === value ? 'selected' : 'target'} onPress={() => onPick(v)} style={sh.choice} />
      ))}
    </View>
  );
}

type Draft = Pick<ActionPayload, 'team' | 'player' | 'action' | 'cause' | 'rebound'>;

export function EditSheet({
  event,
  config,
  lineup,
  title,
  onCorrect,
  onClose,
}: {
  event: LiveEvent;
  config: GameConfig;
  lineup: Partial<Record<Position, string>>;
  title: string;
  onCorrect: (c: CorrectionPayload) => void;
  onClose: () => void;
}) {
  const original = event.type === 'action' ? event.payload : null;
  const [draft, setDraft] = useState<Draft | null>(
    original ? { team: original.team, player: original.player, action: original.action, cause: original.cause ?? null, rebound: original.rebound ?? null } : null,
  );
  const remove = () => {
    onCorrect({ target: event.id, op: 'delete' });
    onClose();
  };

  if (!original || !draft) {
    return (
      <Sheet title={title} onClose={onClose}>
        <Btn label="Delete this" tone="warn" onPress={remove} />
      </Sheet>
    );
  }

  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const causes = draft.action === 'Won it' ? CAUSES_WON : draft.action === 'Lost it' ? CAUSES_LOST : [];
  const save = () => {
    const next: Draft = { ...draft, player: draft.team === 'them' ? null : draft.player };
    if (!causes.length) next.cause = null;
    if (next.action !== 'Miss') next.rebound = null;
    const patch: CorrectionPayload['patch'] = {};
    for (const k of ['team', 'player', 'action', 'cause', 'rebound'] as const) {
      if ((next[k] ?? null) !== (original[k] ?? null)) Object.assign(patch, { [k]: next[k] });
    }
    if (Object.keys(patch).length) onCorrect({ target: event.id, op: 'edit', patch });
    onClose();
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <Text style={sh.label}>Team</Text>
      <Choice items={['us', 'them'] as const} value={draft.team} label={(t) => (t === 'us' ? config.us : config.them)} onPick={(team) => set({ team })} />
      <Text style={sh.label}>Player</Text>
      <Choice
        items={[...POSITIONS, '?'] as PlayerRef[]}
        value={draft.team === 'us' ? draft.player : null}
        label={(p) => (p === '?' ? '?' : `${p} ${shortName(lineup[p])}`.trim())}
        onPick={(player) => set({ player, team: 'us' })}
      />
      <Text style={sh.label}>Action</Text>
      <Choice items={ACTIONS} value={draft.action} onPick={(action) => set({ action })} />
      {causes.length ? (
        <>
          <Text style={sh.label}>Cause</Text>
          <Choice items={causes} value={draft.cause} onPick={(cause) => set({ cause })} />
        </>
      ) : null}
      {draft.action === 'Miss' ? (
        <>
          <Text style={sh.label}>After the miss</Text>
          <Choice
            items={['ours', 'theirs', 'out'] as Rebound[]}
            value={draft.rebound}
            label={(r) => (r === 'ours' ? 'Our rebound' : r === 'theirs' ? 'Their rebound' : 'Out')}
            onPick={(rebound) => set({ rebound })}
          />
        </>
      ) : null}
      <View style={sh.choices}>
        <Btn label="Save" tone="primary" onPress={save} style={sh.choice} />
        <Btn label="Delete" tone="warn" onPress={remove} style={sh.choice} />
      </View>
    </Sheet>
  );
}

/** Tap a position then a bench player to bring them on, or two positions to swap. */
export function SubsSheet({
  lineup,
  bench,
  when,
  onChange,
  onClose,
}: {
  lineup: Partial<Record<Position, string>>;
  bench: string[];
  /** When the change is timed to, in words, e.g. "Q2 6:12" or "the start of Q3". */
  when: string;
  onChange: (lineup: Partial<Record<Position, string>>, bench: string[], detail: string) => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<{ kind: 'pos'; v: Position } | { kind: 'bench'; v: number } | null>(null);

  const bringOn = (p: Position, i: number) => {
    const inn = bench[i];
    if (inn === undefined) return;
    const out = lineup[p];
    const nextBench = bench.filter((_, j) => j !== i);
    if (out) nextBench.push(out);
    onChange({ ...lineup, [p]: inn }, nextBench, `${shortName(inn)} on at ${p}` + (out ? `, ${shortName(out)} off` : ''));
    setPick(null);
  };
  const tapPos = (p: Position) => {
    if (pick?.kind === 'pos' && pick.v !== p) {
      onChange({ ...lineup, [pick.v]: lineup[p], [p]: lineup[pick.v] }, bench, `${pick.v} ↔ ${p}`);
      setPick(null);
    } else if (pick?.kind === 'bench') bringOn(p, pick.v);
    else setPick({ kind: 'pos', v: p });
  };
  const tapBench = (i: number) => {
    if (pick?.kind === 'pos') bringOn(pick.v, i);
    else setPick({ kind: 'bench', v: i });
  };

  return (
    <Sheet title="Subs" onClose={onClose}>
      <Text style={s.muted}>
        Tap a position, then a bench player to bring them on, or tap two positions to swap. Timed to {when}.
      </Text>
      <Text style={sh.label}>On court</Text>
      <View style={sh.choices}>
        {POSITIONS.map((p) => (
          <Btn key={p} label={`${p} ${shortName(lineup[p]) || '–'}`} tone={pick?.kind === 'pos' && pick.v === p ? 'selected' : 'target'} onPress={() => tapPos(p)} style={sh.choice} />
        ))}
      </View>
      <Text style={sh.label}>Bench</Text>
      {bench.length === 0 ? <Text style={s.muted}>Bench is empty</Text> : null}
      <View style={sh.choices}>
        {bench.map((n, i) => (
          <Btn key={`${n}-${i}`} label={n} tone={pick?.kind === 'bench' && pick.v === i ? 'selected' : 'target'} onPress={() => tapBench(i)} style={sh.choice} />
        ))}
      </View>
    </Sheet>
  );
}

export function StatsSheet({
  state,
  events,
  config,
  remainingMs,
  onClose,
}: {
  state: GameState;
  events: readonly GameEvent[];
  config: GameConfig;
  /** The quarter clock now, while a quarter is being played. */
  remainingMs?: number;
  onClose: () => void;
}) {
  const np = netPoints(events);
  const pct = (g: number, n: number) => (n ? `${Math.round((100 * g) / n)}% (${g}/${n})` : '–');
  const onCourt = courtTime(events, config.quarterMs, remainingMs);
  return (
    <Sheet title="Game so far" onClose={onClose}>
      <Table
        head={['Qtr', 'Score', 'CP to goal', 'Shooting', 'Gains', 'Unforced']}
        rows={Object.entries(state.quarters).map(([q, v]) => [
          `Q${q}`,
          `${v.us}–${v.them}`,
          v.centrePasses ? `${v.centrePassGoals} of ${v.centrePasses}` : '–',
          pct(v.goals, v.shots),
          String(v.gains),
          String(v.unforced),
        ])}
      />
      <Text style={sh.label}>Shooters</Text>
      <Table
        head={['Shooter', 'Goals', '%']}
        rows={Object.entries(state.shotsByPlayer)
          .sort((a, b) => b[1].attempts - a[1].attempts)
          .map(([name, v]) => [`${name} (${v.positions.join(', ')})`, `${v.goals} of ${v.attempts}`, pct(v.goals, v.attempts)])}
      />
      <Text style={sh.label}>Time on court</Text>
      <Table
        head={['Player', `Q${state.period}`, 'Game', 'Played at']}
        rows={Object.entries(onCourt)
          .sort((a, b) => b[1].totalMs - a[1].totalMs)
          .map(([name, t]) => [name, fmtClock(t.byPeriod[state.period] ?? 0), fmtClock(t.totalMs), Object.keys(t.byPosition).join(' ')])}
      />
      <Text style={sh.label}>Unforced turnovers by third</Text>
      <Text style={s.text}>
        {Object.entries(state.unforcedByThird)
          .map(([k, n]) => `${k} ${n}`)
          .join(' · ') || 'none'}
      </Text>
      <Text style={sh.label}>Net Points</Text>
      <Table
        head={['Player', 'Net Points']}
        rows={Object.entries(np.byPlayer)
          .sort((a, b) => b[1] - a[1])
          .map(([name, v]) => [name, String(v)])
          .concat([[config.us, String(np.team.us)], [config.them, String(np.team.them)]])}
      />
    </Sheet>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <View>
      <View style={sh.tr}>
        {head.map((h, i) => (
          <Text key={h} style={[sh.th, i > 0 && sh.n]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? <Text style={s.muted}>Nothing yet</Text> : null}
      {rows.map((r, i) => (
        <View key={i} style={sh.tr}>
          {r.map((c, j) => (
            <Text key={j} style={[sh.td, j > 0 && sh.n]}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function ExportSheet({ config, events, onClose }: { config: GameConfig; events: readonly GameEvent[]; onClose: () => void }) {
  const [copied, setCopied] = useState<'log' | 'timing' | null>(null);
  const json = JSON.stringify({ config, events }, null, 1);
  const corrections = events.filter((e) => e.type === 'correction').length;
  const copy = (what: 'log' | 'timing', text: () => string) => void setStringAsync(text()).then(() => setCopied(what));
  return (
    <Sheet title="Event log" onClose={onClose}>
      <Text style={s.muted}>
        {events.length} events including {corrections} corrections. Everything is kept; nothing is overwritten.
      </Text>
      <Btn label={copied === 'log' ? 'Copied' : 'Copy to clipboard'} tone="primary" onPress={() => copy('log', () => json)} />
      <Btn label={copied === 'timing' ? 'Copied' : 'Copy timing table'} onPress={() => copy('timing', () => timingTable(timingRows(config, events), '\t'))} />
      <Text style={s.muted}>
        The timing table pastes into a spreadsheet with one row per event, corrections applied. since_start_s counts from when the clock was first started here, which
        should follow the live scoring clock: add it to the clock start&apos;s time in the video to find each event.
      </Text>
      <Text style={sh.mono} numberOfLines={30}>
        {json}
      </Text>
    </Sheet>
  );
}

const sh = StyleSheet.create({
  sheet: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderColor: '#3a4a66', borderWidth: 1, borderRadius: 10, padding: 10, zIndex: 5 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  close: { minHeight: 40 },
  body: { gap: 8, paddingBottom: 20 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { minWidth: '30%', flexGrow: 1, minHeight: 48 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.surfaceLine, paddingVertical: 5 },
  th: { flex: 1, color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  td: { flex: 1, color: colors.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  n: { textAlign: 'right' },
  mono: { color: colors.text, fontFamily: 'monospace', fontSize: 11 },
});
