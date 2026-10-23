import './polyfills';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False until the Supabase project URL and public key are set in .env */
export const isConfigured = url.startsWith('https://') && anonKey.length > 0;

export const supabase = createClient(
  isConfigured ? url : 'https://not-configured.supabase.co',
  isConfigured ? anonKey : 'not-configured',
  {
    auth: {
      // The browser keeps the session in localStorage; phones use AsyncStorage.
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
  },
);

export const discordInviteUrl =
  process.env.EXPO_PUBLIC_DISCORD_INVITE_URL ?? 'https://discord.gg/R4MvMDex8a';

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'Something went wrong. Please try again.';
}
