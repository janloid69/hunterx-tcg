import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen, Surface } from '@/components/ui';
import { colors } from '@/lib/theme';

export default function ScanScreen() {
  return (
    <Screen>
      <AppText variant="displaySmall" accessibilityRole="header">
        SCAN A CARD
      </AppText>
      <Surface style={styles.card}>
        <View style={styles.iconWrap}>
          <Icon name="scan" size={36} color={colors.accent} />
        </View>
        <AppText variant="heading">Scanning arrives in the next update</AppText>
        <AppText variant="body" color={colors.textMuted} style={styles.center}>
          You'll point your camera at a card and the site will read the number at the bottom. Until
          then, type the card's name or number to add it.
        </AppText>
        <Button label="Add by name or number" icon="search" onPress={() => router.push('/add')} />
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 14, paddingVertical: 32 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center', maxWidth: 420 },
});
