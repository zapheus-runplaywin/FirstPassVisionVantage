import { COURT } from '@firstpass/engine';
import type { CourtPoint } from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

const W = 610;
const H = 305;
const R = (COURT.circleRadiusM / COURT.lengthM) * W;

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
  const [width, setWidth] = useState(0);
  const placed = losses.filter((l) => l.at);
  const forced = losses.filter((l) => l.forced).length;
  const unforced = losses.length - forced;
  const unplaced = losses.length - placed.length;
  return (
    <View>
      <View
        style={s.box}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityLabel={`Court: ${unforced} unforced and ${forced} forced losses this quarter`}
      >
        {width > 0 ? (
          <Svg width={width} height={width / 2} viewBox={`0 0 ${W} ${H}`}>
            <Rect x={2} y={2} width={W - 4} height={H - 4} rx={4} fill={colors.court} stroke={colors.courtLine} strokeWidth={2.5} />
            <Path d={`M2 ${152.5 - R} A${R} ${R} 0 0 1 2 ${152.5 + R}`} stroke={colors.courtLine} strokeWidth={2.5} fill="none" />
            <Path d={`M${W - 2} ${152.5 - R} A${R} ${R} 0 0 0 ${W - 2} ${152.5 + R}`} stroke={colors.courtLine} strokeWidth={2.5} fill="none" />
            <Line x1={203.3} y1={2} x2={203.3} y2={H - 2} stroke={colors.courtLine} strokeWidth={2.5} />
            <Line x1={406.6} y1={2} x2={406.6} y2={H - 2} stroke={colors.courtLine} strokeWidth={2.5} />
            <Circle cx={305} cy={152.5} r={9} stroke={colors.courtLine} strokeWidth={2.5} fill="none" />
            <SvgText x={598} y={26} fill={colors.selected} fontSize={16} fontWeight="700" fontFamily="sans-serif" textAnchor="end">
              our attack →
            </SvgText>
            {placed.map((l, i) => (
              <Circle
                key={i}
                cx={l.at!.x * W}
                cy={l.at!.y * H}
                r={10}
                fill={l.forced ? colors.forcedError : colors.unforcedError}
                stroke="rgba(0,0,0,0.45)"
                strokeWidth={1.5}
              />
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={s.legend}>
        <Legend color={colors.unforcedError} text={`unforced ${unforced}`} />
        <Legend color={colors.forcedError} text={`they won it ${forced}`} />
        {unplaced ? <Text style={s.legendText}>{unplaced} with no court spot</Text> : null}
      </View>
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.swatch, { backgroundColor: color }]} />
      <Text style={s.legendText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { width: '100%', aspectRatio: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.textMuted, fontSize: 13 },
});
