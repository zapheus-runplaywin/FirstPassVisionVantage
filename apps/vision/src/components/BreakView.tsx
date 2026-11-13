import { POSITIONS, type Team } from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SayPoint } from '../stats/breakview';
import type { Lineup } from '../stats/possessions';
import { Btn } from './ui';

/**
 * The break view: opens by itself at the end of each quarter, as in the
 * prototype. The score, then up to three "Say this" points ranked by what the
 * coach can change, then our lineup as the tablet has it for the next quarter.
 */
export function BreakView({
  period,
  fullTime,
  names,
  score,
  quarter,
  points,
  lineup,
  onClose,
}: {
  period: number;
  fullTime: boolean;
  names: Record<Team, string>;
  score: Record<Team, number>;
  quarter: { us: number; them: number; possessions: number };
  points: SayPoint[];
  lineup: Lineup;
  onClose: () => void;
}) {
  return (
    <SafeAreaView style={s.screen} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.title} accessibilityRole="header">
          {fullTime ? 'Full time' : `End of Q${period}`} · {names.us} {score.us} – {score.them} {names.them}
        </Text>
        <Text style={s.sub}>
          Q{period}: {quarter.us}–{quarter.them} · {quarter.possessions} possessions
        </Text>

        <View style={s.heading}>
          <Text style={s.headingLeft}>Say this</Text>
          <Text style={s.headingRight}>ranked by what you can change</Text>
        </View>
        {points.length === 0 ? <Text style={s.sub}>Not enough possessions yet for a point.</Text> : null}
        {points.map((p, i) => (
          <View key={i} style={s.point} accessible accessibilityLabel={`${i + 1}. ${p.headline}. ${p.count}. ${p.anchor}`}>
            <Text style={s.n}>{i + 1}</Text>
            <View style={s.pointText}>
              <Text style={s.headline}>{p.headline}</Text>
              <Text style={s.count}>{p.count}</Text>
              {p.anchor ? <Text style={s.anchor}>{p.anchor}</Text> : null}
            </View>
          </View>
        ))}

        {!fullTime ? (
          <>
            <View style={s.heading}>
              <Text style={s.headingLeft}>On court · {names.us}</Text>
              <Text style={s.headingRight}>as the tablet has it</Text>
            </View>
            <View style={s.lineup}>
              {POSITIONS.map((pos) => (
                <View key={pos} style={s.player}>
                  <Text style={s.pos}>{pos}</Text>
                  <Text style={s.playerName} numberOfLines={1}>
                    {lineup[pos] ?? '–'}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <Btn label={fullTime ? 'Back to the game' : 'Back to live'} onPress={onClose} style={s.close} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background, zIndex: 10 },
  body: { padding: 16, paddingBottom: 40, gap: 8, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: 15 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, marginBottom: 2, gap: 8, flexWrap: 'wrap' },
  headingLeft: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  headingRight: { color: colors.textMuted, fontSize: 13 },
  point: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceLine,
    borderLeftWidth: 5,
    borderLeftColor: colors.selected,
    borderRadius: 12,
    padding: 12,
  },
  n: { color: colors.selected, fontSize: 22, fontWeight: '800', width: 22 },
  pointText: { flex: 1, gap: 2 },
  headline: { color: colors.text, fontSize: 17, fontWeight: '700' },
  count: { color: colors.text, fontSize: 15 },
  anchor: { color: colors.textMuted, fontSize: 13 },
  lineup: { flexDirection: 'row', gap: 4 },
  player: { flex: 1, minWidth: 0, backgroundColor: colors.target, borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  pos: { color: colors.court, fontSize: 13, fontWeight: '800' },
  playerName: { color: colors.targetText, fontSize: 11 },
  close: { marginTop: 20 },
});
