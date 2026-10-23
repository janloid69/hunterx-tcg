import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Screen, Surface } from '@/components/ui';
import { colors } from '@/lib/theme';

const COMING = [
  'Listings with photos, condition, price, and meetup or shipping',
  'Messages with sellers right here, so buyers never have to join the Discord',
  'Offers on listings',
  'A vouch after every finished deal',
  'Verified Seller badges for HunterX Circle members',
];

export default function MarketScreen() {
  return (
    <Screen>
      <AppText variant="displaySmall" accessibilityRole="header">
        MARKET
      </AppText>
      <Surface style={{ gap: 14 }}>
        <AppText variant="heading">The marketplace opens soon</AppText>
        <AppText variant="body" color={colors.textMuted}>
          Build your binder now. When the market opens, you'll be able to list cards straight from it.
        </AppText>
        <View style={styles.list}>
          {COMING.map((line) => (
            <View key={line} style={styles.row}>
              <Icon name="check" size={18} color={colors.up} strokeWidth={2.6} />
              <AppText variant="body" style={{ flex: 1 }}>
                {line}
              </AppText>
            </View>
          ))}
        </View>
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
});
