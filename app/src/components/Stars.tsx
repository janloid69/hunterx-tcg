import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

/** Read-only star rating, e.g. 4.8 ★ (12). */
export function RatingSummary({ rating, count }: { rating: number | null; count: number }) {
  if (count === 0 || rating === null) {
    return <AppText variant="small">No vouches yet</AppText>;
  }
  return (
    <View style={styles.row} accessible accessibilityLabel={`${rating} out of 5 from ${count} vouches`}>
      <Icon name="star" size={14} color={colors.gold} filled />
      <AppText variant="smallStrong">{Number(rating).toFixed(1)}</AppText>
      <AppText variant="small">
        · {count} {count === 1 ? 'vouch' : 'vouches'}
      </AppText>
    </View>
  );
}

/** Five tappable stars for leaving a vouch. */
export function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          accessibilityRole="radio"
          accessibilityLabel={`${star} star${star > 1 ? 's' : ''}`}
          accessibilityState={{ checked: value === star }}
          onPress={() => onChange(star)}
          style={styles.star}
        >
          <Icon name="star" size={30} color={star <= value ? colors.gold : colors.borderStrong} filled={star <= value} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
