import { colors } from '@firstpass/ui';
import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.screen}>
      <Text style={styles.wordmark}>
        <Text style={styles.first}>First</Text>
        <Text style={styles.pass}>Pass</Text>
        <Text style={styles.product}> VISION</Text>
      </Text>
      <Text style={styles.note}>Live coach view. Phase 0 build.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 16,
  },
  wordmark: { fontSize: 48, fontWeight: '800', fontStyle: 'italic' },
  first: { color: colors.text },
  pass: { color: colors.attention },
  product: { color: colors.selected },
  note: { color: colors.textMuted, fontSize: 18 },
});
