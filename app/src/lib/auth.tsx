import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';

import { errorMessage, isConfigured, supabase } from './supabase';
import type { Profile } from './types';

// identify: Discord username and avatar. guilds.members.read: roles in the
// HunterX server, which decide the Verified Seller and Mod badges.
const DISCORD_SCOPES = 'identify guilds.members.read';

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  roleSyncError: string | null;
  signInWithDiscord: () => Promise<void>;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function syncDiscordRoles(providerToken: string): Promise<void> {
  const { error } = await supabase.functions.invoke('discord-sync', {
    body: { providerToken },
  });
  if (error) throw error;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [roleSyncError, setRoleSyncError] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (!error) setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      const providerToken = nextSession?.provider_token;
      const userId = nextSession?.user.id;
      // Discord's token is only available right after signing in, so read the
      // member's server roles now. Supabase calls are deferred out of this
      // callback, as the supabase-js docs recommend.
      if (event === 'SIGNED_IN' && providerToken && userId) {
        setTimeout(() => {
          syncDiscordRoles(providerToken)
            .then(() => {
              setRoleSyncError(null);
              return loadProfile(userId);
            })
            .catch((error: unknown) => setRoleSyncError(errorMessage(error)));
        }, 0);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (userId) loadProfile(userId);
    else setProfile(null);
  }, [userId, loadProfile]);

  // On phones, only refresh the session while the app is open.
  useEffect(() => {
    if (Platform.OS === 'web' || !isConfigured) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => subscription.remove();
  }, []);

  const signInWithDiscord = useCallback(async () => {
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: { scopes: DISCORD_SCOPES, redirectTo: window.location.origin },
      });
      if (error) throw error;
      return; // The browser now leaves for Discord and comes back signed in.
    }

    const redirectTo = Linking.createURL('/');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { scopes: DISCORD_SCOPES, redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data.url) throw new Error('Supabase did not return a Discord sign-in link');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return;
    const code = new URL(result.url).searchParams.get('code');
    if (!code) throw new Error('Discord sign-in did not finish. Please try again.');
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoleSyncError(null);
  }, []);

  const reloadProfile = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      roleSyncError,
      signInWithDiscord,
      signOut,
      reloadProfile,
    }),
    [session, profile, loading, roleSyncError, signInWithDiscord, signOut, reloadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
