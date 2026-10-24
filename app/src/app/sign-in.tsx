import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Notice } from '@/components/ui';
import { Wordmark } from '@/components/Wordmark';
import { useAuth } from '@/lib/auth';
import { discordInviteUrl, errorMessage, isConfigured } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';

const FEATURES = [
  { title: 'Binder and set progress', body: 'Every card you own, what each set is missing, and what you paid.' },
  { title: 'Scan cards, see peso prices', body: 'Point your camera at a card number. See what it sells for here and worldwide, in pesos.' },
  { title: 'Message sellers here', body: 'Chat with sellers on the site. No need to join the Discord to buy.' },
];

export default function SignInScreen() {
  const { signInWithDiscord } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithDiscord();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Wordmark size={34} />

        <View style={styles.hero}>
          <AppText variant="eyebrow" color={colors.accent}>
            For Filipino collectors
          </AppText>
          <AppText variant="display" accessibilityRole="header">
            YOUR COLLECTION, PRICED IN PESOS.
          </AppText>
          <AppText variant="display" color={colors.accent}>
            TRADE WITH PEOPLE YOU TRUST.
          </AppText>
          <AppText variant="body" color={colors.textMuted} style={styles.lead}>
            Track your cards and collectibles, then buy, sell and trade with members of the HunterX
            Discord.
          </AppText>
        </View>

        {!isConfigured ? (
          <Notice tone="error">
            The site isn't connected to its database yet. Add the Supabase URL and key to the .env
            file (see README).
          </Notice>
        ) : null}

        {error ? <Notice tone="error">{error}</Notice> : null}

        <View style={styles.actions}>
          <Button
            label="Sign in with Discord"
            variant="discord"
            icon="chat"
            size="lg"
            loading={busy}
            disabled={!isConfigured}
            onPress={handleSignIn}
          />
          <Button
            label="Join the HunterX Discord"
            variant="outline"
            size="lg"
            onPress={() => Linking.openURL(discordInviteUrl)}
          />
        </View>
        <AppText variant="small">
          We only read your Discord name, picture and HunterX server roles. Free to use.
        </AppText>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.feature}>
              <Icon name="check" size={18} color={colors.up} strokeWidth={2.6} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">{feature.title}</AppText>
                <AppText variant="small">{feature.body}</AppText>
              </View>
            </View>
          ))}
        </View>

        <Pressable accessibilityRole="link" onPress={() => router.push('/rules')} style={styles.rulesLink}>
          <AppText variant="smallStrong" color={colors.accent}>
            House rules and privacy
          </AppText>
        </Pressable>

        <AppText variant="small" color={colors.textFaint} style={styles.disclaimer}>
          HunterX TCG is a fan-run community site. It is not affiliated with The Pokémon Company,
          Bandai, Konami, Riot Games, Square Enix, Mattel or Takara Tomy.
        </AppText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rulesLink: { alignSelf: 'center', minHeight: 40, justifyContent: 'center' },
  page: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 48 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 24, gap: 24 },
  hero: { gap: 6 },
  lead: { marginTop: 10, fontSize: 17, lineHeight: 26, fontFamily: fonts.regular },
  actions: { gap: 12 },
  features: { gap: 14 },
  feature: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  disclaimer: { marginTop: 8 },
});
