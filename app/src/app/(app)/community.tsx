import { Linking, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Badge, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { discordInviteUrl } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function CommunityScreen() {
  const { profile } = useAuth();

  return (
    <Screen>
      <AppText variant="displaySmall" accessibilityRole="header">
        COMMUNITY
      </AppText>

      <View style={styles.discordCard}>
        <View style={styles.titleRow}>
          <Icon name="chat" size={22} color={colors.discordIcon} />
          <AppText variant="heading">The HunterX Discord</AppText>
        </View>
        <AppText variant="body" color={colors.discordText}>
          {profile?.in_guild
            ? "You're a member. Your roles come with you into the site."
            : "You're not in the server yet. Join to sell, get badges and see events."}
        </AppText>
        {profile?.in_guild ? (
          <View style={styles.badges}>
            {profile.is_verified_seller ? <Badge label="Verified Seller" /> : null}
            {profile.is_mod ? <Badge label="Mod" tone="mod" /> : null}
            {!profile.is_verified_seller && !profile.is_mod ? <Badge label="Member" tone="muted" /> : null}
          </View>
        ) : null}
        <Button
          label={profile?.in_guild ? 'Open the Discord' : 'Join the Discord'}
          variant="discord"
          icon="external"
          onPress={() => Linking.openURL(discordInviteUrl)}
        />
      </View>

      <AppText variant="body" color={colors.textMuted}>
        Server events, like pull nights, will show here once the HunterX bot is connected.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  discordCard: {
    backgroundColor: colors.discordSurface,
    borderColor: colors.discordBorder,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badges: { flexDirection: 'row', gap: 6 },
});
