import type { CourtPoint } from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { StyleSheet, Text, View } from 'react-native';
import { Circle } from 'react-native-svg';
import { at, CourtDrawing } from './CourtDrawing';

export interface LossDot {
  forced: boolean;
  at: CourtPoint | null;
}

/**
 * Where we lost the ball this quarter, drawn in our attacking direction
 * (attack to the right) whichever end we are attacking. Forced losses (they
 * won it) are orange-red, unforced ones gold.
 */
export function MiniCourt({ losses }: { losses: LossDot[] }) {
  const placed = losses.filter((l) => l.at);
  const forced = losses.filter((l) => l.forced).length;
  const unforced = losses.length - forced;
  const unplaced = losses.length - placed.length;
  return (
    <View>
      <CourtDrawing label={`Court: ${unforced} unforced and ${forced} forced losses this quarter`}>
        {placed.map((l, i) => (
          <Circle
            key={i}
            {...at(l.at!)}
            r={10}
            fill={l.forced ? colors.forcedError : colors.unforcedError}
            stroke="rgba(0,0,0,0.45)"
            strokeWidth={1.5}
          />
        ))}
      </CourtDrawing>
      <View style={s.legend}>
        <Legend color={colors.unforcedError} text={`unforced ${unforced}`} />
        <Legend color={colors.forcedError} text={`they won it ${forced}`} />
        {unplaced ? <Text style={s.legendText}>{unplaced} with no court spot</Text> : null}
      </View>
    </View>
  );
}

export function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.swatch, { backgroundColor: color }]} />
      <Text style={s.legendText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.textMuted, fontSize: 13 },
});
