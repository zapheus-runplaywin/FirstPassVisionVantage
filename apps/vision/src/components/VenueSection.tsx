import { colors, venueName, type VenueLink } from '@firstpass/ui';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { connectVenue, loadVenueLink, saveVenueLink, venueAvailable } from '../lib/venue';
import { Btn, ui } from './ui';

/**
 * The games list's Venue link section, in the phone app only: connecting
 * this phone to the FirstPass Studio Mac at the venue, so a game's stats are
 * also read from it over the venue's network (live/venue.ts).
 */
export function VenueSection() {
  const [link, setLink] = useState<VenueLink | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [asking, setAsking] = useState<'no' | 'asking' | 'waiting'>('no');
  const [message, setMessage] = useState<string | null>(null);
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    void loadVenueLink().then((l) => !gone.current && setLink(l));
    return () => {
      gone.current = true;
    };
  }, []);
  if (!venueAvailable) return null;

  const connect = () => {
    setMessage(null);
    setAsking('asking');
    void connectVenue(
      typed,
      () => setAsking('waiting'),
      () => gone.current,
    ).then((got) => {
      if (gone.current) return;
      setAsking('no');
      if ('link' in got) {
        setLink(got.link);
        setTyped('');
        setOpen(false);
      } else setMessage(got.message);
    });
  };

  if (link) {
    return (
      <View style={styles.row}>
        <Text style={[ui.muted, styles.grow]}>Venue link: Studio {venueName(link.base)}</Text>
        <Btn
          label="Disconnect"
          tone="quiet"
          onPress={() => {
            void saveVenueLink(null);
            setLink(null);
          }}
          style={styles.small}
        />
      </View>
    );
  }
  if (!open) {
    return (
      <View style={styles.row}>
        <Text style={[ui.muted, styles.grow]}>At a venue streaming with FirstPass Studio?</Text>
        <Btn label="Venue link" tone="dim" onPress={() => setOpen(true)} style={styles.small} />
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <Text style={ui.muted}>
        Type the six letters of Studio&apos;s secure link, shown on its Devices tab, while this phone is on the venue&apos;s network. Someone at the Studio Mac
        then presses Allow. Games on Studio&apos;s scoreboard reach this phone from Studio as well as from your club.
      </Text>
      <View style={styles.row}>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          editable={asking === 'no'}
          placeholder="Six letters"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          onSubmitEditing={connect}
        />
        <Btn label={asking === 'no' ? 'Connect' : asking === 'asking' ? 'Asking…' : 'Waiting for Allow…'} onPress={connect} disabled={asking !== 'no' || !typed.trim()} style={styles.small} />
      </View>
      {message ? <Text style={styles.error}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: { gap: 8 },
  grow: { flex: 1 },
  small: { minHeight: 40, paddingHorizontal: 14 },
  error: { color: colors.attention },
  input: { flex: 1, minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: '#3a4a66', backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 10, fontSize: 17 },
});
