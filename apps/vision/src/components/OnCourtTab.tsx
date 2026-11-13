import { colors } from '@firstpass/ui';
import { StyleSheet, Text, View } from 'react-native';
import type { MatchUp } from '../stats/markers';
import { TeamTag } from './Chips';

/** The On court tab: our seven against the players they line up on. */
export function OnCourtTab({ rows }: { rows: MatchUp[] }) {
  if (rows.every((r) => !r.ours.name)) return <Text style={s.hint}>No lineup from the tablet yet.</Text>;
  return (
    <View style={s.wrap}>
      {rows.map(({ ours, theirs }) => (
        <View
          key={ours.position}
          style={s.row}
          accessible
          accessibilityLabel={`${ours.position} ${ours.name ?? 'nobody'}, ${ours.since}${ours.mark ? `, ${ours.mark}` : ''}${ours.detail ? `, ${ours.detail}` : ''}; against ${theirs.position} ${theirs.name ?? 'not recorded'}`}
        >
          <View style={s.side}>
            <View style={s.nameRow}>
              <TeamTag team="us" label={ours.position} />
              <Text style={s.name} numberOfLines={1}>
                {ours.name ?? '–'}
              </Text>
            </View>
            <Text style={s.sub} numberOfLines={2}>
              {ours.since}
              {ours.mark || ours.detail ? ' · ' : ''}
              {ours.mark ? <Text style={[s.mark, ours.mark === 'cold' && s.cold]}>{ours.mark} </Text> : null}
              {ours.detail}
            </Text>
          </View>
          <Text style={s.vs}>vs</Text>
          <View style={[s.side, s.right]}>
            <View style={[s.nameRow, s.rightRow]}>
              <Text style={[s.name, s.nameRight]} numberOfLines={1}>
                {theirs.name ?? 'not recorded'}
              </Text>
              <TeamTag team="them" label={theirs.position} />
            </View>
            <Text style={[s.sub, s.nameRight]} numberOfLines={1}>
              {theirs.since}
            </Text>
          </View>
        </View>
      ))}
      <Text style={s.hint}>
        Hot and cold compare this quarter with the game: shooters by goals of attempts (from 5 shots), everyone else by gains minus unforced losses (+2
        or -2).
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 820, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceLine, minHeight: 60 },
  side: { flex: 1, minWidth: 0, gap: 3 },
  right: { alignItems: 'flex-end' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rightRow: { justifyContent: 'flex-end' },
  name: { color: colors.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  nameRight: { textAlign: 'right' },
  sub: { color: colors.textMuted, fontSize: 13 },
  mark: { color: colors.attention, fontWeight: '800', textTransform: 'uppercase' },
  cold: { color: '#8fc5ec' },
  vs: { color: colors.textMuted, fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 14, paddingVertical: 16 },
});
