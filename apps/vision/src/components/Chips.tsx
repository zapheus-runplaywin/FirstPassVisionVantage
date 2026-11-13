import { colors } from '@firstpass/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** A row of choice chips: the chosen one is white, the rest outlined. */
export function Chips<T extends string | number>({ options, value, onChange }: { options: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.row} accessibilityRole="radiogroup">
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <Pressable
            key={String(v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(v)}
            style={[s.chip, on && s.on]}
          >
            <Text style={[s.text, on && s.textOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A small team tag: ours blue, theirs gold. */
export function TeamTag({ team, label }: { team: 'us' | 'them'; label: string }) {
  return (
    <View style={[s.tag, { backgroundColor: team === 'us' ? colors.ourTeam : colors.opposition }]}>
      <Text style={[s.tagText, { color: team === 'us' ? colors.text : colors.targetText }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.surfaceLine, justifyContent: 'center' },
  on: { backgroundColor: colors.target, borderColor: colors.target },
  text: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  textOn: { color: colors.targetText, fontWeight: '800' },
  tag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  tagText: { fontSize: 12, fontWeight: '800' },
});
