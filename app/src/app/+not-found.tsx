import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { colors } from '@/lib/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.page}>
      <AppText variant="displaySmall" accessibilityRole="header">
        PAGE NOT FOUND
      </AppText>
      <AppText variant="body" color={colors.textMuted}>
        That link doesn't go anywhere in HunterX TCG.
      </AppText>
      <Button label="Go to Home" onPress={() => router.replace('/')} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
});
