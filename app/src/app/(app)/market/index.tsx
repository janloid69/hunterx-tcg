import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ChipRow } from '@/components/Chip';
import { ListingCard } from '@/components/ListingCard';
import { Notice, Screen, Surface, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getGames } from '@/lib/data';
import { getListings, type ListingSort } from '@/lib/market';
import { colors, maxContentWidth } from '@/lib/theme';
import type { ListingWithRefs } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

const PAGE = 48;

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function MarketScreen() {
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const games = useQuery(getGames, []);
  const [gameId, setGameId] = useState('all');
  const [sort, setSort] = useState<ListingSort>('newest');
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const listings = useQuery(() => getListings({ gameId, sort, search: term, limit: PAGE }), [gameId, sort, term]);
  const [more, setMore] = useState<ListingWithRefs[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMore, setNoMore] = useState(false);

  useEffect(() => {
    setMore([]);
    setNoMore(false);
  }, [gameId, sort, term]);

  const gameOptions = useMemo(
    () => [{ value: 'all', label: 'All' }, ...(games.data ?? []).map((game) => ({ value: game.id, label: game.name }))],
    [games.data],
  );

  const all = [...(listings.data ?? []), ...more];
  const contentWidth = Math.min(width, maxContentWidth) - 40;
  const columns = Math.max(2, Math.min(6, Math.floor((contentWidth + 14) / 190)));
  const tileWidth = Math.floor((contentWidth - (columns - 1) * 14) / columns);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await getListings({ gameId, sort, search: term, limit: PAGE, offset: all.length });
      setMore((current) => [...current, ...next]);
      if (next.length < PAGE) setNoMore(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Screen>
      <View style={styles.titleRow}>
        <AppText variant="displaySmall" accessibilityRole="header">
          MARKET
        </AppText>
        <View style={styles.titleActions}>
          <Button label="My listings" variant="outline" onPress={() => router.push('/market/mine')} />
          <Button label="Sell" icon="plus" onPress={() => router.push('/market/new')} />
        </View>
      </View>

      {profile && !profile.in_guild ? (
        <Notice tone="discord">
          <AppText variant="small" color={colors.discordText}>
            You can browse and message sellers. Selling is for HunterX Discord members.
          </AppText>
        </Notice>
      ) : null}

      <TextField
        label="Search listings"
        hideLabel
        placeholder="Search listings, e.g. Charizard or booster box"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        returnKeyType="search"
      />
      <ChipRow accessibilityLabel="Game" options={gameOptions} value={gameId} onChange={setGameId} scroll />
      <ChipRow<ListingSort>
        accessibilityLabel="Sort by"
        options={[
          { value: 'newest', label: 'Newest' },
          { value: 'price_low', label: 'Price: low to high' },
          { value: 'price_high', label: 'Price: high to low' },
        ]}
        value={sort}
        onChange={setSort}
        scroll
      />

      {listings.error ? <Notice tone="error">{listings.error}</Notice> : null}
      {listings.loading && !listings.data ? <ActivityIndicator color={colors.accent} /> : null}

      {!listings.loading && all.length === 0 ? (
        <Surface style={{ gap: 12 }}>
          <AppText variant="heading">{term ? 'No listings match that search' : 'No listings yet'}</AppText>
          <AppText variant="body" color={colors.textMuted}>
            {term
              ? 'Try a shorter search or another game.'
              : 'Be the first to list something. Members of the HunterX Discord can sell straight from their binder.'}
          </AppText>
          {term ? null : <Button label="Sell something" icon="plus" onPress={() => router.push('/market/new')} />}
        </Surface>
      ) : null}

      <View style={styles.grid}>
        {all.map((listing) => (
          <ListingCard key={listing.id} listing={listing} width={tileWidth} />
        ))}
      </View>

      {all.length >= PAGE && !noMore ? (
        <Button label="Show more" variant="outline" loading={loadingMore} onPress={loadMore} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  titleActions: { flexDirection: 'row', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 24 },
});
