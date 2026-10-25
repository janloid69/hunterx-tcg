import { Anton_400Regular } from '@expo-google-fonts/anton';
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
} from '@expo-google-fonts/archivo';
import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/lib/auth';
import { setupPwa } from '@/lib/pwa';
import { colors } from '@/lib/theme';

/**
 * Shown instead of a blank page if any screen crashes. The error text helps
 * us fix it; members can retry or reload.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.errorPage}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorBody}>
        Please try again. If it keeps happening, send this message to a HunterX mod:
      </Text>
      <Text selectable style={styles.errorDetail}>
        {error?.message || String(error)}
      </Text>
      <View style={styles.errorActions}>
        <Pressable accessibilityRole="button" onPress={retry} style={[styles.errorButton, styles.errorPrimary]}>
          <Text style={styles.errorPrimaryText}>Try again</Text>
        </Pressable>
        {Platform.OS === 'web' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => window.location.assign('/')}
            style={[styles.errorButton, styles.errorOutline]}
          >
            <Text style={styles.errorOutlineText}>Go to Home</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// On the web, wait at most this long for the fonts before showing the site.
// Text starts in the phone's own font and switches when the files arrive.
// (The iPhone home-screen app sometimes never reports them as loaded, and
// expo-font would otherwise wait 12 seconds.)
const WEB_FONT_WAIT_MS = 2500;

function useFontsReady(): boolean {
  const [fontsLoaded, fontError] = useFonts({
    Anton_400Regular,
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
  });
  const [waitedEnough, setWaitedEnough] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const timer = setTimeout(() => setWaitedEnough(true), WEB_FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  return fontsLoaded || fontError !== null || waitedEnough;
}

export default function RootLayout() {
  const fontsReady = useFontsReady();
  useEffect(() => {
    setupPwa();
  }, []);

  return (
    <SafeAreaProvider style={{ backgroundColor: colors.bg }}>
      <AuthProvider>
        <StatusBar style="light" />
        {fontsReady ? <RootNavigator /> : <Loading />}
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  const signedIn = session !== null;

  // Each guard says where to send people. Without it, Expo Router picks the
  // first open page by name length, which put signed-out visitors on House
  // rules instead of sign-in.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={signedIn} redirectTo="/sign-in">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo="/">
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Screen name="rules" />
    </Stack>
  );
}

function Loading() {
  return (
    <View style={styles.loading} accessibilityLabel="Loading">
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  errorPage: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  errorTitle: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  errorBody: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 460 },
  errorDetail: {
    color: colors.down,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    maxWidth: 560,
  },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  errorButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  errorPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  errorPrimaryText: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
  errorOutline: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
  errorOutlineText: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
