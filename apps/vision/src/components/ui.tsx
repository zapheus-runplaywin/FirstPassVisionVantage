import { colors } from '@firstpass/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

export type Tone = 'target' | 'dim' | 'quiet';

/** White tap target on black; the other tones step back. */
export function Btn({
  label,
  onPress,
  tone = 'target',
  style,
  disabled,
  children,
}: {
  label: string;
  onPress?: () => void;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
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
      style={({ pressed }) => [ui.btn, { backgroundColor: t.bg }, (pressed || disabled) && ui.pressed, style]}
    >
      {children ?? <Text style={[ui.btnLabel, { color: t.fg }]}>{label}</Text>}
    </Pressable>
  );
}

const tones: Record<Tone, { bg: string; fg: string }> = {
  target: { bg: colors.target, fg: colors.targetText },
  dim: { bg: colors.targetDim, fg: colors.text },
  quiet: { bg: 'transparent', fg: colors.textMuted },
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  btn: { minHeight: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnLabel: { fontSize: 17, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '800' },
  body: { color: colors.text, fontSize: 16 },
  muted: { color: colors.textMuted, fontSize: 15 },
  error: { color: colors.attention, fontSize: 15 },
  input: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceLine,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 20,
    paddingHorizontal: 14,
    letterSpacing: 2,
  },
});
