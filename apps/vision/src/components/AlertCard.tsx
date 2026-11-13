import { colors } from '@firstpass/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Card } from '../stats/alerts';

/** One insight card: what, the numbers behind it, why now, and star or dismiss. */
export function AlertCard({
  card,
  starred,
  onStar,
  onDismiss,
}: {
  card: Card;
  starred: boolean;
  onStar: () => void;
  onDismiss?: () => void;
}) {
  const retired = card.retiredWhen !== null;
  return (
    <View style={[s.card, retired && s.retired]} accessible={false}>
      <Text style={[s.tag, card.kind === 'act' && s.tagAct]}>{card.kind === 'act' ? 'You can act' : 'Trend'}</Text>
      <Text style={s.headline}>{card.headline}</Text>
      <Text style={s.count}>{card.count}</Text>
      <Text style={s.anchor}>
        {card.anchor}
        {card.anchor ? ' · ' : ''}
        {retired ? `retired ${card.retiredWhen}` : card.createdWhen}
      </Text>
      <View style={s.acts}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={starred ? 'Starred' : 'Star for the report'}
          accessibilityState={{ selected: starred }}
          onPress={onStar}
          style={({ pressed }) => [s.act, starred && s.starOn, pressed && s.pressed]}
        >
          <Text style={[s.actText, starred && s.starOnText]}>{starred ? '★ Starred' : '☆ Star'}</Text>
        </Pressable>
        {!retired && onDismiss ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss for this quarter"
            onPress={onDismiss}
            style={({ pressed }) => [s.act, pressed && s.pressed]}
          >
            <Text style={s.actText}>Dismiss</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** What shows in the card slot when nothing has passed its gates. */
export function NoCard() {
  return (
    <View style={[s.card, s.empty]}>
      <Text style={s.emptyTitle}>Nothing to flag yet</Text>
      <Text style={s.anchor}>Cards appear when a trend passes its threshold with enough possessions behind it.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceLine,
    borderLeftWidth: 5,
    borderLeftColor: colors.attention,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 2,
  },
  retired: { borderLeftColor: '#6B7A93', opacity: 0.65 },
  empty: { borderLeftColor: colors.surfaceLine },
  emptyTitle: { color: colors.textMuted, fontSize: 17 },
  tag: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  tagAct: { color: colors.selected },
  headline: { color: colors.text, fontSize: 18, fontWeight: '700' },
  count: { color: colors.text, fontSize: 15 },
  anchor: { color: colors.textMuted, fontSize: 13 },
  acts: { flexDirection: 'row', gap: 8, marginTop: 10 },
  act: { minHeight: 40, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.surfaceLine, justifyContent: 'center' },
  actText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  starOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  starOnText: { color: colors.targetText },
  pressed: { opacity: 0.7 },
});
