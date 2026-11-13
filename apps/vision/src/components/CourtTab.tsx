import type { Team } from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, G, Rect, Text as SvgText } from 'react-native-svg';
import { courtView, type CourtMode, type DotKind } from '../stats/court';
import type { GameModel } from '../stats/possessions';
import { Chips } from './Chips';
import { at, CourtDrawing, H, W } from './CourtDrawing';
import { Legend } from './MiniCourt';

const FILL: Record<DotKind, string> = {
  unforced: colors.unforcedError,
  forced: colors.forcedError,
  win: colors.target,
  goal: colors.target,
  miss: 'none',
};

/** The Court tab: where a team loses it, wins it, and shoots from, by quarter. */
export function CourtTab({ model, names }: { model: GameModel; names: Record<Team, string> }) {
  const [mode, setMode] = useState<CourtMode>('lose');
  const [period, setPeriod] = useState<number | 'all'>('all');
  const [team, setTeam] = useState<Team>('us');
  const view = useMemo(() => courtView(model, { mode, period, team, names }), [model, mode, period, team, names]);
  const we = team === 'us';
  const quarters = Array.from({ length: model.period }, (_, i) => [i + 1, `Q${i + 1}`] as const);
  const shots = mode === 'shots';

  return (
    <View style={s.wrap}>
      <Chips
        options={[
          ['lose', we ? 'Where we lose it' : 'Where they lose it'],
          ['win', we ? 'Where we win it' : 'Where they win it'],
          ['shots', 'Shots by sector'],
        ]}
        value={mode}
        onChange={setMode}
      />
      <Chips options={[['all', 'Whole game'], ...quarters]} value={period} onChange={setPeriod} />
      <Chips
        options={[
          ['us', names.us],
          ['them', names.them],
        ]}
        value={team}
        onChange={setTeam}
      />
      <CourtDrawing
        zoom={shots ? (we ? 'right third' : 'left third') : 'full'}
        maxHeight={shots ? 360 : 460}
        label={`${view.line}. ${view.legend.map((l) => `${l.label} ${l.count}`).join(', ')}`}
      >
        {view.dots.map((d, i) => {
          const r = shots ? 5 : 9 + 5 * Math.sqrt(d.n - 1);
          const p = at(d.at);
          return (
            <G key={i}>
              <Circle
                {...p}
                r={r}
                fill={FILL[d.kind]}
                stroke={d.kind === 'miss' ? colors.attention : 'rgba(0,0,0,0.4)'}
                strokeWidth={d.kind === 'miss' ? 2.5 : 1.5}
              />
              {d.n > 1 ? (
                <SvgText x={p.cx} y={p.cy + 5} textAnchor="middle" fontSize={14} fontWeight="800" fontFamily="sans-serif" fill={colors.targetText}>
                  {d.n}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        {view.sectors.map((sec) => {
          // Keep labels inside the zoomed third.
          const lo = we ? W - 204 + 24 : 24;
          const x = Math.min(Math.max(sec.at.x * W, lo), lo + 204 - 48);
          const y = sec.at.y * H;
          return (
            <G key={sec.key}>
              <Rect x={x - 22} y={y - 14} width={44} height={28} rx={4} fill="rgba(15,23,42,0.88)" />
              <SvgText x={x} y={y - 1} textAnchor="middle" fontSize={13} fontWeight="800" fontFamily="sans-serif" fill={colors.text}>
                {`${Math.round((100 * sec.goals) / sec.of)}%`}
              </SvgText>
              <SvgText x={x} y={y + 10} textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill={colors.textMuted}>
                {`${sec.goals} of ${sec.of}`}
              </SvgText>
            </G>
          );
        })}
      </CourtDrawing>
      <View style={s.legend}>
        {view.legend.map((l) => (
          <Legend key={l.kind} color={l.kind === 'miss' ? colors.attention : FILL[l.kind]} text={`${l.label} ${l.count}`} />
        ))}
        {view.unplaced ? <Text style={s.muted}>{view.unplaced} with no court spot</Text> : null}
      </View>
      <Text style={s.line}>{view.line}</Text>
      {shots ? <Text style={s.muted}>Close is under 2.5 m from the post. Each sector shows goals of attempts.</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 6, width: '100%', maxWidth: 820, alignSelf: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  line: { color: colors.text, fontSize: 16, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 13 },
});
