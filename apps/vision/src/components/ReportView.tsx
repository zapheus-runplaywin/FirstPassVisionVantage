import { colors } from '@firstpass/ui';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { REPORT_NOTE } from '../stats/reportDoc';
import { Btn } from './ui';
import type { GameReport } from '../stats/report';

/** The game report: the whole game as tables, for after the game. */
export function ReportView({
  report,
  fullTime,
  onSave,
  saveError,
}: {
  report: GameReport;
  fullTime: boolean;
  /** Opens the browser's print box (print, or save as a PDF) or the phone's share sheet. */
  onSave: () => void;
  saveError: string | null;
}) {
  return (
    <View style={s.wrap}>
      <View style={s.titleRow}>
        <Text style={s.title}>{fullTime ? 'Game report' : 'Game report so far'}</Text>
        <Btn label={Platform.OS === 'web' ? 'Print or save' : 'Share'} tone="dim" onPress={onSave} style={s.save} />
      </View>
      {saveError ? <Text style={s.error}>{saveError}</Text> : null}
      {report.tables.map((t) => (
        <View key={t.title} style={s.table} accessible={t.rows.length === 0} accessibilityLabel={t.rows.length === 0 ? `${t.title}: ${t.empty}` : undefined}>
          <Text style={s.heading}>{t.title}</Text>
          {t.rows.length === 0 ? (
            <Text style={s.hint}>{t.empty}</Text>
          ) : (
            <>
              <Row cells={t.head} head wide={t.head.length > 4} />
              {t.rows.map((r, i) => (
                <Row key={i} cells={r} wide={t.head.length > 4} strong={t.title === 'By quarter' && r[0] === 'Game'} />
              ))}
            </>
          )}
        </View>
      ))}
      {report.unforcedByThird ? (
        <View style={s.table}>
          <Text style={s.heading}>Unforced turnovers by third</Text>
          <Text style={s.cell}>{report.unforcedByThird}</Text>
        </View>
      ) : null}
      <Text style={s.hint}>
        These are the figures the statistician sees in Vantage. Net Points adds up what each player did for and against the team. Time on court needs
        the lineup and substitutions to have been recorded.
      </Text>
      <Text style={s.hint}>{REPORT_NOTE}</Text>
    </View>
  );
}

/** `wide`: a table with many columns, where the first is a short label and every column gets the same room. */
function Row({ cells, head, strong, wide }: { cells: string[]; head?: boolean; strong?: boolean; wide?: boolean }) {
  return (
    <View style={[s.row, head && s.headRow]} accessible accessibilityLabel={cells.filter(Boolean).join(', ')}>
      {cells.map((c, i) => (
        <Text key={i} style={[s.cell, i === 0 ? (wide ? s.firstShort : s.first) : s.number, head && s.head, strong && s.strong]} numberOfLines={i === 0 || head ? 2 : 1}>
          {c}
        </Text>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, color: colors.text, fontSize: 22, fontWeight: '800' },
  save: { minHeight: 44, paddingHorizontal: 14 },
  error: { color: colors.attention, fontSize: 15 },
  table: { gap: 2 },
  heading: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.surfaceLine },
  headRow: { paddingVertical: 4 },
  cell: { color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'] },
  first: { flex: 2, minWidth: 0 },
  firstShort: { flex: 1, minWidth: 0 },
  number: { flex: 1, textAlign: 'right' },
  head: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  strong: { fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 14 },
});
