import { colors } from '@firstpass/ui';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { OnCourt } from '../stats/markers';

/** Our seven on court, with hot or cold under anyone who has earned it this quarter. */
export function OnCourtStrip({ players }: { players: OnCourt[] }) {
  if (players.every((p) => !p.name)) {
    return <Text style={s.empty}>No lineup from the tablet yet.</Text>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
      {players.map((p) => (
        <View
          key={p.position}
          style={s.chip}
          accessible
          accessibilityLabel={`${p.position} ${p.name ?? 'nobody'}${p.mark ? `, ${p.mark}` : ''}${p.detail ? `, ${p.detail}` : ''}`}
        >
          <Text style={s.pos}>{p.position}</Text>
          <Text style={s.name} numberOfLines={1}>
            {p.name ?? '–'}
          </Text>
          <Text style={[s.mark, p.mark === 'cold' && s.cold]}>{p.mark ?? ' '}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  strip: { gap: 6, paddingBottom: 2 },
  chip: { backgroundColor: colors.target, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 9, minWidth: 62, minHeight: 52, alignItems: 'center' },
  pos: { color: colors.court, fontSize: 14, fontWeight: '800' },
  name: { color: colors.targetText, fontSize: 13, maxWidth: 90 },
  mark: { color: colors.attention, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  cold: { color: colors.court },
  empty: { color: colors.textMuted, fontSize: 14 },
});
