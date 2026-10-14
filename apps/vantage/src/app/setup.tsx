import { POSITIONS, type CourtEnd, type EntryMode, type Position, type Team } from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, s, Seg } from '../components/ui';
import { startNewGame } from '../game/newGame';

const EXAMPLE: Record<Position, string> = { GS: '7 Priya', GA: '9 Jade', WA: '5 Kim', C: '4 Tess', WD: '6 Lily', GD: '3 Sam', GK: '1 Ruby' };

export default function Setup() {
  const [us, setUs] = useState('Hawks');
  const [them, setThem] = useState('Kestrels');
  const [minutes, setMinutes] = useState('15');
  const [mode, setMode] = useState<EntryMode>('core');
  const [end, setEnd] = useState<CourtEnd>('right');
  const [cp, setCp] = useState<Team>('us');
  const [lineup, setLineup] = useState<Record<Position, string>>(EXAMPLE);
  const [bench, setBench] = useState('8 Jo, 11 Mia, 14 Ava, 15 Zoe');

  const start = () => {
    const quarterMs = Math.max(1, Math.min(20, Number(minutes) || 15)) * 60_000;
    const id = startNewGame(
      { us: us.trim() || 'Us', them: them.trim() || 'Them', quarterMs, q1AttackEnd: end, firstCentrePass: cp },
      mode,
      Object.fromEntries(POSITIONS.map((p) => [p, lineup[p].trim() || p])),
      bench
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean),
    );
    router.replace({ pathname: '/game/[id]', params: { id } });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>Game setup</Text>
        <Text style={s.muted}>Example names are filled in so you can start straight away.</Text>
        <View style={styles.fields}>
          <Field label="Our team" value={us} onChange={setUs} />
          <Field label="Opposition" value={them} onChange={setThem} />
          <Field label="Quarter length (minutes)" value={minutes} onChange={setMinutes} numeric />
        </View>
        <Text style={s.h2}>Entry mode</Text>
        <Seg value={mode} onChange={setMode} options={[['core', 'Core'], ['full', 'Full Net Points']]} />
        <Text style={s.h2}>Which end do we attack in Q1, as you see the court?</Text>
        <Seg value={end} onChange={setEnd} options={[['left', 'We attack LEFT'], ['right', 'We attack RIGHT']]} />
        <Text style={s.h2}>Who takes the first centre pass?</Text>
        <Seg value={cp} onChange={setCp} options={[['us', 'Us'], ['them', 'Them']]} />
        <Text style={s.h2}>Our starting seven</Text>
        <View style={styles.fields}>
          {POSITIONS.map((p) => (
            <Field key={p} label={p} value={lineup[p]} onChange={(v) => setLineup({ ...lineup, [p]: v })} />
          ))}
        </View>
        <Field label="Bench (comma separated, number and name)" value={bench} onChange={setBench} />
        <Btn label="Start game" tone="primary" big onPress={start} style={styles.start} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, numeric }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={s.muted}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? 'number-pad' : 'default'}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  inner: { padding: 16, gap: 10, maxWidth: 900, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { flexGrow: 1, minWidth: 170, gap: 4 },
  input: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: '#3a4a66', backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, fontSize: 16 },
  start: { marginTop: 12, alignSelf: 'flex-start', minWidth: 240 },
});
