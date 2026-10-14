import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

/*
 * The project URL and anon key live in app.json under expo.extra.supabase.
 * The anon key is public by design: row-level security decides what it can
 * reach. Without them the app runs offline only.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { supabase?: { url?: string; anonKey?: string } };
const url = extra.supabase?.url;
const anonKey = extra.supabase?.anonKey;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
      })
    : null;
