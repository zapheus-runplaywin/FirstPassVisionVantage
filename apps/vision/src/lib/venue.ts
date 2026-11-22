import AsyncStorage from '@react-native-async-storage/async-storage';
import { pairVenue, venueFromText, venueToText, type VenueFetch, type VenueLink } from '@firstpass/ui';
import { Platform } from 'react-native';

/*
 * The Studio this phone is connected to for the venue link (live/venue.ts),
 * kept on the phone. Only the phone app: Vision in a browser can't ask Studio
 * for a game's events, so it stays on the internet.
 */

const VENUE_KEY = 'firstpass.vision.venueLink';

/** Whether this copy of Vision can use the venue link at all. */
export const venueAvailable = Platform.OS !== 'web';

export const venueFetch: VenueFetch = (url, init) => fetch(url, init as RequestInit);

export async function loadVenueLink(): Promise<VenueLink | null> {
  if (!venueAvailable) return null;
  return venueFromText(await AsyncStorage.getItem(VENUE_KEY).catch(() => null));
}

export async function saveVenueLink(link: VenueLink | null): Promise<void> {
  if (link) await AsyncStorage.setItem(VENUE_KEY, venueToText(link)).catch(() => undefined);
  else await AsyncStorage.removeItem(VENUE_KEY).catch(() => undefined);
}

/** Asks the Studio at `typed` to allow this phone. Gives the link, or why not. */
export async function connectVenue(
  typed: string,
  onWaiting: () => void,
  cancelled: () => boolean,
  fetcher: VenueFetch = venueFetch,
): Promise<{ link: VenueLink } | { message: string }> {
  const got = await pairVenue({ typed, name: 'FirstPass Vision', fetch: fetcher, onWaiting, cancelled });
  if (!got.ok) return { message: got.message };
  await saveVenueLink(got.link);
  return { link: got.link };
}
