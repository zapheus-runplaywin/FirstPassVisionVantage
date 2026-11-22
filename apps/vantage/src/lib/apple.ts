import * as AppleAuthentication from 'expo-apple-authentication';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { client } from './supabase';

/*
 * Sign in with Apple, the same way FirstPass HQ does it (HQ src/lib/sign-in.ts):
 * on an iPhone, iPad or Mac only, with Apple's own sheet, so a member who
 * joined their club in HQ with Apple reaches the same account here. Android
 * and the web stay Google only: Apple there needs a web flow with a secret
 * key that expires every 6 months.
 *
 * The club's Supabase project must list this app's bundle id under
 * Authentication > Providers > Apple > Client IDs, or Supabase refuses the
 * token ("Unacceptable audience in id_token").
 */

/** Whether to offer Apple's button: only where Apple says it is available. */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Apple signs an identity token for this app, carrying the hash of a one-time
 * value made here; Supabase checks both before it finds the member, so a
 * token can't be replayed. Closing Apple's sheet is not an error.
 */
export async function signInWithApple(): Promise<void> {
  const supabase = client();
  if (!supabase) throw new Error('Choose your club first');
  const nonce = randomUUID();
  const hashedNonce = await digestStringAsync(CryptoDigestAlgorithm.SHA256, nonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code === 'ERR_REQUEST_CANCELED') return;
    throw e;
  }
  if (!credential.identityToken) throw new Error("Apple didn't return a sign-in. Try again.");

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce });
  if (error) throw error;

  // Apple gives the name only the first time, and never in the token. Someone
  // who meets the club here before HQ would lose it, so it is kept on the
  // sign-in for HQ's join form. A failed save never stops the sign-in.
  const fullName = appleFullName(credential.fullName);
  if (fullName) {
    try {
      await supabase.auth.updateUser({ data: { full_name: fullName } });
    } catch {
      // The member is signed in; HQ's join form asks for the name instead.
    }
  }
}

/** "Given Middle Family" from Apple's name parts, or null when Apple sent none. */
export function appleFullName(name: { givenName?: string | null; middleName?: string | null; familyName?: string | null } | null | undefined): string | null {
  const parts = [name?.givenName, name?.middleName, name?.familyName].map((part) => part?.trim()).filter((part): part is string => !!part);
  return parts.length ? parts.join(' ') : null;
}
