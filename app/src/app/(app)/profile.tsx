import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Badge, Notice, Screen, Surface } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function ProfileScreen() {
  const { profile, session, roleSyncError, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const synced = profile?.roles_synced_at ? new Date(profile.roles_synced_at) : null;

  return (
    <Screen>
      <AppText variant="displaySmall" accessibilityRole="header">
        YOUR PROFILE
      </AppText>

      <Surface style={styles.card}>
        <View style={styles.avatar}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} accessibilityIgnoresInvertColors />
          ) : (
            <Icon name="user" size={32} color={colors.text} />
          )}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading">{profile?.display_name ?? 'Collector'}</AppText>
          {profile?.username ? <AppText variant="small">@{profile.username} on Discord</AppText> : null}
          <View style={styles.badges}>
            {profile?.is_verified_seller ? <Badge label="Verified Seller" /> : null}
            {profile?.is_mod ? <Badge label="Mod" tone="mod" /> : null}
            {profile && !profile.in_guild ? <Badge label="Not in the HunterX Discord" tone="muted" /> : null}
          </View>
        </View>
      </Surface>

      {roleSyncError ? (
        <Notice tone="error">{`We couldn't read your Discord roles: ${roleSyncError}`}</Notice>
      ) : null}

      <Surface style={{ gap: 8 }}>
        <AppText variant="bodyStrong">Discord roles</AppText>
        <AppText variant="small">
          {synced
            ? `Last checked ${synced.toLocaleString()}. Roles are checked each time you sign in.`
            : 'Roles are checked each time you sign in.'}
        </AppText>
        <AppText variant="small">
          Got the hunterxcircle role just now? Sign out and back in to get your Verified Seller badge.
        </AppText>
      </Surface>

      {session?.user.email ? (
        <AppText variant="small">Signed in as {session.user.email}</AppText>
      ) : null}

      <Button
        label="Sign out"
        variant="outline"
        icon="logout"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await signOut();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 60, height: 60, borderRadius: 30 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
});
