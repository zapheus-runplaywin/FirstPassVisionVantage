import { colors } from '@firstpass/ui';
import { StyleSheet, Text, View } from 'react-native';
import { DECK_COLUMNS, DECK_ROWS, type DeckKey, type DeckLook } from '../game/deck';
import { keyboardLabel } from '../game/keyboard';
import { Sheet } from './Sheets';
import { s } from './ui';

const LOOKS: Record<DeckLook, { bg: string; fg: string }> = {
  lit: { bg: colors.target, fg: colors.targetText },
  plain: { bg: '#334155', fg: colors.text },
  dim: { bg: colors.targetDim, fg: colors.targetDimText },
  selected: { bg: colors.selected, fg: colors.targetText },
  alert: { bg: colors.attention, fg: colors.text },
  info: { bg: colors.surface, fg: colors.textMuted },
  off: { bg: colors.background, fg: 'rgba(255,255,255,0.3)' },
};

/** Which keyboard key does what right now: the four rows of the keyboard, as they sit under your hands. */
export function KeysSheet({ keys, onClose }: { keys: readonly DeckKey[]; onClose: () => void }) {
  return (
    <Sheet title="Keyboard shortcuts" onClose={onClose}>
      <Text style={s.muted}>
        The four rows of your keyboard, eight keys from the left. Tap or click the court for where, then press who and what. Backspace undoes too. End
        quarter takes two presses. Hold a key and it still counts once.
      </Text>
      {Array.from({ length: DECK_ROWS }, (_, row) => (
        <View key={row} style={styles.row}>
          {keys.slice(row * DECK_COLUMNS, (row + 1) * DECK_COLUMNS).map((key, col) => {
            const look = LOOKS[key.look];
            return (
              <View key={col} style={[styles.key, { backgroundColor: look.bg }]}>
                <Text style={[styles.letter, { color: look.fg }]}>{keyboardLabel(row * DECK_COLUMNS + col)}</Text>
                <Text style={[styles.title, { color: look.fg }]} numberOfLines={2}>
                  {key.title.replace('\n', ' ')}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  key: { flex: 1, minHeight: 58, borderRadius: 6, padding: 4, borderWidth: 1, borderColor: colors.surfaceLine },
  letter: { fontSize: 15, fontWeight: '800' },
  title: { fontSize: 10, fontWeight: '600' },
});
