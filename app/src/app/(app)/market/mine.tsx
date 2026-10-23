import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ChipRow } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ListingCard } from '@/components/ListingCard';
import { Notice, Screen, Surface } from '@/components/ui';
import { getMyListings } from '@/lib/market';
import { colors, maxContentWidth } from '@/lib/theme';
import type { ListingStatus } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

type Filter = 'selling' | 'sold' | 'removed';

const MATCH: Record<Filter, ListingStatus[]> = {
  selling: ['active', 'reserved'],
  sold: ['sold'],
  removed: ['removed'],
};

export default function MyListingsScreen() {
  const { width } = useWindowDimensions();
  const listings = useQuery(getMyListings, []);
  const [filter, setFilter] = useState<Filter>('selling');

  const all = listings.data ?? [];
  const shown = all.filter((listing) => MATCH[filter].includes(listing.status));
  const count = (f: Filter) => all.filter((listing) => MATCH[f].includes(listing.status)).length;

  const contentWidth = Math.min(width, maxContentWidth) - 40;
  const columns = Math.max(2, Math.min(6, Math.floor((contentWidth + 14) / 190)));
  const tileWidth = Math.floor((contentWidth - (columns - 1) * 14) / columns);

  return (
    <Screen>
      <Pressable
        accessibilityRole="link"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/market'))}
        style={styles.back}
      >
        <Icon name="chevronLeft" size={22} color={colors.text} strokeWidth={2} />
        <AppText variant="bodyStrong">Market</AppText>
      </Pressable>

      <View style={styles.titleRow}>
        <AppText variant="displaySmall" accessibilityRole="header">
          MY LISTINGS
        </AppText>
        <Button label="Sell" icon="plus" onPress={() => router.push('/market/new')} />
      </View>

      <ChipRow<Filter>
        accessibilityLabel="Show"
        options={[
          { value: 'selling', label: `For sale (${count('selling')})` },
          { value: 'sold', label: `Sold (${count('sold')})` },
          { value: 'removed', label: `Removed (${count('removed')})` },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {listings.error ? <Notice tone="error">{listings.error}</Notice> : null}
      {listings.loading && !listings.data ? <ActivityIndicator color={colors.accent} /> : null}

      {!listings.loading && shown.length === 0 ? (
        <Surface style={{ gap: 10 }}>
          <AppText variant="body" color={colors.textMuted}>
            {filter === 'selling' ? "You're not selling anything right now." : 'Nothing here yet.'}
          </AppText>
          {filter === 'selling' ? <Button label="List something" icon="plus" onPress={() => router.push('/market/new')} /> : null}
        </Surface>
      ) : null}

      {shown.some((listing) => listing.hidden_at) ? (
        <Notice tone="error">
          A listing marked hidden was reported by several members. It stays off the Market until a mod reviews it.
        </Notice>
      ) : null}

      <View style={styles.grid}>
        {shown.map((listing) => (
          <ListingCard key={listing.id} listing={listing} width={tileWidth} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 24 },
});
