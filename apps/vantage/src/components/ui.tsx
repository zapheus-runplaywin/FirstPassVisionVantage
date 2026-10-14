import { colors } from '@firstpass/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export type Tone = 'target' | 'primary' | 'selected' | 'dim' | 'quiet' | 'warn';

export function Btn({
  label,
  onPress,
  tone = 'target',
  style,
  big,
  disabled,
  children,
}: {
  label?: string;
  onPress?: () => void;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const t = tones[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.btn, big && s.big, { backgroundColor: t.bg }, t.border, pressed && s.pressed, style]}
    >
      {children ?? <Text style={[s.label, big && s.bigLabel, { color: t.fg }]}>{label}</Text>}
    </Pressable>
  );
}

const tones: Record<Tone, { bg: string; fg: string; border?: ViewStyle }> = {
  target: { bg: colors.target, fg: colors.targetText },
  primary: { bg: colors.attention, fg: colors.text },
  selected: { bg: colors.selected, fg: colors.targetText },
  dim: { bg: colors.targetDim, fg: colors.targetDimText },
  quiet: { bg: 'transparent', fg: colors.textMuted },
  warn: { bg: '#3a1a08', fg: colors.text, border: { borderWidth: 2, borderColor: colors.attention } },
};

export function Panel({ title, hint, children, style }: { title?: string; hint?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.panel, style]}>
      {title ? (
        <View style={s.panelHead}>
          <Text style={s.panelTitle}>{title}</Text>
          {hint ? <Text style={s.panelHint} numberOfLines={1}>{hint}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <View style={s.seg}>
      {options.map(([v, label]) => (
        <Btn key={v} label={label} tone={v === value ? 'selected' : 'dim'} onPress={() => onChange(v)} style={s.segBtn} />
      ))}
    </View>
  );
}

export function fmtClock(ms: number): string {
  const sec = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

export const s = StyleSheet.create({
  btn: { minHeight: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  big: { minHeight: 72 },
  pressed: { opacity: 0.75 },
  label: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  bigLabel: { fontSize: 20 },
  panel: { backgroundColor: colors.surface, borderColor: colors.surfaceLine, borderWidth: 1, borderRadius: 10, padding: 8, gap: 6 },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  panelTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  panelHint: { color: colors.textMuted, fontSize: 12, flexShrink: 1 },
  seg: { flexDirection: 'row', gap: 6 },
  segBtn: { flex: 1, minHeight: 48 },
  text: { color: colors.text, fontSize: 15 },
  muted: { color: colors.textMuted, fontSize: 13 },
  h1: { color: colors.text, fontSize: 24, fontWeight: '700' },
  h2: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8 },
});
