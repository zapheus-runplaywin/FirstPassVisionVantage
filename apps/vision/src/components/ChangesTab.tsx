import type { Team } from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { StyleSheet, Text, View } from 'react-native';
import { pct, when, type Verdict } from '../stats/changes';
import { TeamTag } from './Chips';

/** The Changes tab: every lineup change by either team, newest first, with its verdict. */
export function ChangesTab({ verdicts, names }: { verdicts: Verdict[]; names: Record<Team, string> }) {
  if (!verdicts.length) {
    return (
      <Text style={s.hint}>No lineup changes yet. Each change by either team gets a verdict once there are 8 possessions on each side of it.</Text>
    );
  }
  return (
    <View style={s.wrap}>
      {verdicts.map((v) => {
        const c = v.change;
        const detail = v.state === 'early' ? v.measure : `${v.measure} ${pct(v.before)} → ${pct(v.after)}`;
        return (
          <View
            key={`${c.team}:${c.position}:${c.index}`}
            style={s.row}
            accessible
            accessibilityLabel={`${names[c.team]} ${c.position}: ${c.off} off, ${c.on} on, ${when(c)}. ${v.text}, ${detail}`}
          >
            <View style={s.left}>
              <View style={s.nameRow}>
                <TeamTag team={c.team} label={names[c.team]} />
                <Text style={s.name}>
                  {c.position}: {c.on} on for {c.off}
                </Text>
              </View>
              <Text style={s.subLeft}>{when(c)}</Text>
            </View>
            <View style={s.verdict}>
              <Text style={[s.text, v.state === 'hurt' && s.hurt, v.state === 'helped' && s.helped, (v.state === 'early' || v.state === 'none') && s.flat]}>
                {v.state === 'helped' ? '↑ ' : v.state === 'hurt' ? '↓ ' : ''}
                {v.text}
              </Text>
              <Text style={s.sub}>{detail}</Text>
            </View>
          </View>
        );
      })}
      <Text style={s.hint}>
        A change in attack or centre court is judged by that team's scoring; GK, GD and WD changes by the other team's. It compares the last 8
        possessions before the change with every one since, and needs 8 on each side. A 20-point move is a verdict.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 820, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceLine, minHeight: 60 },
  left: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { color: colors.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  sub: { color: colors.textMuted, fontSize: 13, textAlign: 'right' },
  subLeft: { color: colors.textMuted, fontSize: 13 },
  verdict: { alignItems: 'flex-end', maxWidth: '45%' },
  text: { color: colors.text, fontSize: 15, fontWeight: '800' },
  helped: { color: colors.text },
  hurt: { color: colors.attention },
  flat: { color: colors.textMuted, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 14, paddingVertical: 16 },
});
