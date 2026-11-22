import { colors, venueName } from '@firstpass/ui';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { connectVenue, setVenueLink, venueLink } from '../lib/venue';
import { Btn, s } from './ui';

/**
 * Home's Venue link section: connecting this tablet to the FirstPass Studio
 * Mac at the venue, so each event also goes straight to it (lib/venue.ts).
 */
export function VenueSection() {
  const [link, setLink] = useState(venueLink);
  const [typed, setTyped] = useState('');
  const [asking, setAsking] = useState<'no' | 'asking' | 'waiting'>('no');
  const [message, setMessage] = useState<string | null>(null);
  const stopped = useRef(false);
  useEffect(
    () => () => {
      stopped.current = true;
    },
    [],
  );

  const connect = () => {
    stopped.current = false;
    setMessage(null);
    setAsking('asking');
    void connectVenue(
      typed,
      () => setAsking('waiting'),
      () => stopped.current,
    ).then((problem) => {
      if (stopped.current) return;
      setAsking('no');
      setMessage(problem);
      if (!problem) {
        setTyped('');
        setLink(venueLink());
      }
    });
  };

  return (
    <View style={styles.section}>
      <Text style={s.h2}>Venue link</Text>
      <Text style={s.muted}>
        At a venue that streams with FirstPass Studio, this tablet can also send each event straight to the Studio Mac over the venue&apos;s network, so the
        stream&apos;s stats keep up when the internet is slow. Your club still gets every event as before. Leave this alone anywhere else.
      </Text>
      {link ? (
        <View style={styles.row}>
          <Text style={s.muted}>Connected to Studio {venueName(link.base)}. It takes the game on its scoreboard.</Text>
          <Btn
            label="Disconnect"
            tone="quiet"
            onPress={() => {
              setVenueLink(null);
              setLink(null);
              setMessage(null);
            }}
          />
        </View>
      ) : (
        <View style={styles.row}>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            editable={asking === 'no'}
            placeholder="Studio's six letters"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            onSubmitEditing={connect}
          />
          <Btn label={asking === 'no' ? 'Connect' : asking === 'asking' ? 'Asking…' : 'Waiting for Allow…'} disabled={asking !== 'no' || !typed.trim()} onPress={connect} />
        </View>
      )}
      {asking === 'waiting' ? <Text style={s.muted}>The Studio Mac is asking whether to allow this tablet. Press Allow there.</Text> : null}
      {message ? <Text style={styles.error}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  error: { color: colors.attention },
  input: { minHeight: 48, minWidth: 220, borderRadius: 8, borderWidth: 1, borderColor: '#3a4a66', backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, fontSize: 18 },
});
