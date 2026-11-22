import { MARKER_FORMATS, MARKER_KINDS, markerFile, markersFromClockStart, MARKERS_NOTE, VIDEO_RATES, type MarkerFormat, type VideoRate } from '@firstpass/engine';
import type { GameConfig, GameEvent } from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { saveFile } from '../lib/saveFile';
import { Btn } from './ui';

/** Everything but single touches, which would crowd a timeline. */
const KINDS = MARKER_KINDS.map((k) => k.kind).filter((k) => k !== 'touch');

/**
 * Video markers, under the game report: the game's events as a file a video
 * editor reads, lined up from where the first quarter starts in the video.
 */
export function MarkersPanel({ config, events }: { config: GameConfig; events: readonly GameEvent[] }) {
  const [into, setInto] = useState('');
  const [fps, setFps] = useState<VideoRate>(25);
  const [said, setSaid] = useState<{ error?: string; done?: string } | null>(null);

  const save = (format: MarkerFormat) => {
    const made = markersFromClockStart(config, events, { into, fps, kinds: KINDS });
    if (made.error !== undefined) return setSaid({ error: made.error });
    const { placed } = made;
    const left = placed.outside ? ` ${placed.outside} from before the video starts were left out.` : '';
    setSaid({ done: `${placed.markers.length} markers saved.${left}` });
    saveFile(markerFile(format, config, placed)).catch((e: unknown) => setSaid({ error: e instanceof Error ? e.message : "Couldn't save the file." }));
  };

  return (
    <View style={s.wrap}>
      <Text style={s.heading}>Video markers</Text>
      <Text style={s.hint}>
        Puts a named marker on every goal, miss, gain and turnover in a video editor. Find the moment the first quarter starts in your video and type how far in it is.
      </Text>
      <View style={s.row}>
        <Text style={s.label}>First quarter starts at</Text>
        <TextInput
          accessibilityLabel="How far into the video the first quarter starts"
          value={into}
          onChangeText={setInto}
          placeholder="3:12"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          style={s.input}
        />
      </View>
      <View style={s.row}>
        <Text style={s.label}>Frames a second</Text>
        {VIDEO_RATES.map((r) => (
          <Btn key={r} label={String(r)} tone={r === fps ? 'target' : 'dim'} onPress={() => setFps(r)} style={s.chip} />
        ))}
      </View>
      <View style={s.row}>
        {MARKER_FORMATS.map((f) => (
          <Btn key={f.format} label={f.format === 'list' ? f.label : `For ${f.label}`} tone="dim" onPress={() => save(f.format)} style={s.save} />
        ))}
      </View>
      {said?.error ? <Text style={s.error}>{said.error}</Text> : null}
      {said?.done ? <Text style={s.hint}>{said.done}</Text> : null}
      {MARKER_FORMATS.map((f) => (
        <Text key={f.format} style={s.hint}>
          {f.label}: {f.how}
        </Text>
      ))}
      <Text style={s.hint}>Each marker sits 5 seconds before the statistician's tap. {MARKERS_NOTE}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10, borderTopWidth: 1, borderTopColor: colors.surfaceLine, paddingTop: 16 },
  heading: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  hint: { color: colors.textMuted, fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  label: { color: colors.text, fontSize: 15 },
  input: { minHeight: 44, width: 110, borderRadius: 8, borderWidth: 1, borderColor: colors.surfaceLine, color: colors.text, paddingHorizontal: 10, fontSize: 17 },
  chip: { minHeight: 40, paddingHorizontal: 12 },
  save: { minHeight: 44, paddingHorizontal: 14, flexGrow: 1 },
  error: { color: colors.attention, fontSize: 15 },
});
