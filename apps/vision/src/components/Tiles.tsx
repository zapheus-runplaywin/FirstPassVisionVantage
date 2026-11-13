import { colors } from '@firstpass/ui';
import { StyleSheet, Text, View } from 'react-native';
import type { Tile } from '../stats/tiles';

const BETTER = '#5FD38D';
const WORSE = '#FF7A6B';
const GREY = '#6B7A93';

const ARROWS: Record<NonNullable<Tile['arrow']>, { glyph: string; color: string; says: string }> = {
  'better up': { glyph: '↑', color: BETTER, says: 'up, better' },
  'better down': { glyph: '↓', color: BETTER, says: 'down, better' },
  'worse up': { glyph: '↑', color: WORSE, says: 'up, worse' },
  'worse down': { glyph: '↓', color: WORSE, says: 'down, worse' },
};

/** The five conversion tiles: two columns, unforced turnovers across the bottom. */
export function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <View style={s.grid}>
      {tiles.map((t) => (
        <TileView key={t.key} tile={t} wide={t.key === 'unforced'} />
      ))}
    </View>
  );
}

function TileView({ tile: t, wide }: { tile: Tile; wide: boolean }) {
  const arrow = t.arrow ? ARROWS[t.arrow] : null;
  const trend = t.early ? `too early, ${t.need}` : t.trend;
  const label = `${t.label}: ${t.figure}, ${t.count}.${trend ? ` ${trend}` : ''}${arrow ? `, ${arrow.says}` : ''}`;
  return (
    <View style={[s.tile, wide && s.wide]} accessible accessibilityLabel={label}>
      <View style={wide ? s.wideLeft : undefined}>
        <Text style={s.label}>{t.label}</Text>
        <Text style={[s.figure, t.early && s.early]}>{t.figure}</Text>
        <Text style={s.count}>{t.count}</Text>
      </View>
      <View style={wide ? s.wideRight : undefined}>
        <Text style={[s.trend, t.early && s.early]} numberOfLines={1}>
          {trend || ' '}
          {arrow ? <Text style={{ color: arrow.color, fontWeight: '800' }}> {arrow.glyph}</Text> : null}
        </Text>
        <View style={s.bar}>
          <View
            style={[
              s.fill,
              { width: `${Math.round(t.fill * 100)}%`, backgroundColor: t.early ? GREY : t.key === 'unforced' ? colors.attention : colors.court },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceLine,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  wide: { flexBasis: '100%', flexDirection: 'row', alignItems: 'center', gap: 16 },
  wideLeft: { minWidth: 120 },
  wideRight: { flex: 1 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  figure: { color: colors.text, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  count: { color: colors.text, fontSize: 14 },
  trend: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  early: { color: GREY },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceLine, marginTop: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
