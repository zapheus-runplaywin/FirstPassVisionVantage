import {
  DEFAULT_LEAD_MS,
  MARKER_FORMATS,
  MARKER_KINDS,
  markerFile,
  markersFromClockStart,
  MARKERS_NOTE,
  VIDEO_RATES,
  type MarkerFormat,
  type MarkerKind,
  type VideoRate,
} from '@firstpass/engine';
import type { GameConfig, GameEvent } from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Btn, s } from './ui';

const LEADS = [0, 3000, 5000, 8000] as const;

/** Writes one marker file and opens the share sheet on it. */
async function shareFile(file: { name: string; text: string; mime: string }): Promise<void> {
  if (!(await isAvailableAsync())) throw new Error('Sharing is not available on this device');
  const out = new File(Paths.cache, file.name);
  if (out.exists) out.delete();
  out.create();
  out.write(file.text);
  await shareAsync(out.uri, { mimeType: file.mime, dialogTitle: 'Save or send the video markers' });
}

/**
 * Video markers, in the Event log sheet: the game's events as a file a video
 * editor reads, lined up from where the first quarter starts in the video.
 */
export function MarkersSection({ config, events }: { config: GameConfig; events: readonly GameEvent[] }) {
  const [into, setInto] = useState('');
  const [fps, setFps] = useState<VideoRate>(25);
  const [leadMs, setLeadMs] = useState<number>(DEFAULT_LEAD_MS);
  const [off, setOff] = useState<readonly MarkerKind[]>(['touch']);
  const [said, setSaid] = useState<{ error?: string; done?: string } | null>(null);

  const kinds = MARKER_KINDS.map((k) => k.kind).filter((k) => !off.includes(k));
  const toggle = (kind: MarkerKind) => setOff((was) => (was.includes(kind) ? was.filter((k) => k !== kind) : [...was, kind]));

  const save = (format: MarkerFormat) => {
    const made = markersFromClockStart(config, events, { into, fps, leadMs, kinds });
    if (made.error !== undefined) return setSaid({ error: made.error });
    const { placed } = made;
    const left = placed.outside ? ` ${placed.outside} from before the video starts were left out.` : '';
    setSaid({ done: `${placed.markers.length} markers.${left}` });
    shareFile(markerFile(format, config, placed)).catch((e: unknown) => setSaid({ error: e instanceof Error ? e.message : 'Could not share the file' }));
  };

  return (
    <View style={st.box}>
      <Text style={st.title}>Video markers</Text>
      <Text style={s.muted}>
        Puts a named marker on every event in a video editor. Find the moment the first quarter starts in your video (the clock was started here then) and type how far in
        it is.
      </Text>
      <View style={st.row}>
        <Text style={st.label}>First quarter starts at</Text>
        <TextInput
          accessibilityLabel="How far into the video the first quarter starts"
          value={into}
          onChangeText={setInto}
          placeholder="3:12"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          style={st.input}
        />
      </View>
      <Text style={st.label}>Frames a second</Text>
      <View style={st.row}>
        {VIDEO_RATES.map((r) => (
          <Btn key={r} label={String(r)} tone={r === fps ? 'selected' : 'target'} onPress={() => setFps(r)} style={st.chip} />
        ))}
      </View>
      <Text style={st.label}>Marker sits this long before the tap</Text>
      <View style={st.row}>
        {LEADS.map((l) => (
          <Btn key={l} label={`${l / 1000} s`} tone={l === leadMs ? 'selected' : 'target'} onPress={() => setLeadMs(l)} style={st.chip} />
        ))}
      </View>
      <Text style={st.label}>Mark</Text>
      <View style={st.row}>
        {MARKER_KINDS.map((k) => (
          <Btn key={k.kind} label={k.label} tone={off.includes(k.kind) ? 'dim' : 'selected'} onPress={() => toggle(k.kind)} style={st.chip} />
        ))}
      </View>
      <View style={st.row}>
        {MARKER_FORMATS.map((f) => (
          <Btn key={f.format} label={f.format === 'list' ? f.label : `For ${f.label}`} tone="primary" onPress={() => save(f.format)} style={st.save} />
        ))}
      </View>
      {said?.error ? <Text style={st.error}>{said.error}</Text> : null}
      {said?.done ? <Text style={s.muted}>{said.done}</Text> : null}
      {MARKER_FORMATS.map((f) => (
        <Text key={f.format} style={s.muted}>
          {f.label}: {f.how}
        </Text>
      ))}
      <Text style={s.muted}>{MARKERS_NOTE}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: 8, borderTopWidth: 1, borderTopColor: colors.surfaceLine, paddingTop: 10, marginTop: 4 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  input: { minHeight: 44, minWidth: 110, borderRadius: 8, borderWidth: 1, borderColor: '#3a4a66', backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, fontSize: 18 },
  chip: { minHeight: 40, paddingHorizontal: 10 },
  save: { minHeight: 48, flexGrow: 1 },
  error: { color: colors.attention, fontSize: 13 },
});
