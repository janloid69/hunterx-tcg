import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Notice } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { discordInviteUrl } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/**
 * For signed-in people who aren't in the HunterX Discord: selling needs the
 * server. The bot marks them as members seconds after they join, so "I've
 * joined" just reloads their profile (no signing out).
 */
export function JoinToSell({ compact = false }: { compact?: boolean }) {
  const { reloadProfile } = useAuth();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);

  async function checkAgain() {
    setChecking(true);
    try {
      await reloadProfile();
    } finally {
      setChecking(false);
      setChecked(true);
    }
  }

  return (
    <Notice tone="discord">
      {compact ? (
        <AppText variant="small" color={colors.discordText}>
          You can browse and message sellers. <AppText variant="smallStrong">Want to be a seller?</AppText> Join the
          HunterX Discord. It’s free.
        </AppText>
      ) : (
        <>
          <AppText variant="bodyStrong">Want to be a seller? Join the HunterX Discord!</AppText>
          <AppText variant="small" color={colors.discordText}>
            Selling is for members of the server, so every seller is someone the mods know. It’s free to join.
          </AppText>
        </>
      )}
      <View style={styles.buttons}>
        <Button label="Join the Discord" variant="discord" icon="external" onPress={() => Linking.openURL(discordInviteUrl)} />
        <Button label="I’ve joined" variant="outline" loading={checking} onPress={checkAgain} />
      </View>
      {checked && !checking ? (
        <AppText variant="small" color={colors.discordText}>
          We don’t see you in the server yet. It can take a minute after joining, so try again shortly. Still nothing?
          Sign out and back in.
        </AppText>
      ) : null}
    </Notice>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
