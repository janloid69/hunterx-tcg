import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AddToBinderSheet } from '@/components/AddToBinder';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CardArt } from '@/components/CardArt';
import { Icon } from '@/components/Icon';
import { ListingCard } from '@/components/ListingCard';
import { LogSaleSheet } from '@/components/LogSaleSheet';
import { PriceGuidePanel } from '@/components/Prices';
import { Notice, Screen, SectionHeader, Surface } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getCard, getGames } from '@/lib/data';
import { conditionLabels, peso, timeAgo } from '@/lib/format';
import { getListings } from '@/lib/market';
import { getCardPrice, getCardSales, removeLoggedSale, saleLabel } from '@/lib/prices';
import { errorMessage } from '@/lib/supabase';
import { colors, maxContentWidth, wideBreakpoint } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

export default function CardScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= wideBreakpoint;

  const card = useQuery(() => getCard(id), [id]);
  const games = useQuery(getGames, []);
  const price = useQuery(() => getCardPrice(id), [id]);
  const sales = useQuery(() => getCardSales(id), [id]);
  const listings = useQuery(() => getListings({ cardId: id, limit: 12 }), [id]);
  const [sheet, setSheet] = useState<'add' | 'log' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contentWidth = Math.min(width, maxContentWidth) - 40;
  const columns = Math.max(2, Math.min(6, Math.floor((contentWidth + 14) / 190)));
  const tileWidth = Math.floor((contentWidth - (columns - 1) * 14) / columns);
  const imageWidth = wide ? 320 : Math.min(width - 40, 360);

  if (card.loading && !card.data) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (!card.data) {
    return (
      <Screen>
        <BackLink />
        <Notice tone="error">{card.error ?? 'Card not found.'}</Notice>
      </Screen>
    );
  }

  const item = card.data;
  const gameName = games.data?.find((game) => game.id === item.game_id)?.name;
  const image = item.image_large ?? item.image_small;
  const graded = (sales.data ?? []).filter((sale) => sale.kind === 'graded');

  function refreshPrices() {
    price.reload();
    sales.reload();
  }

  async function remove(saleId: string) {
    setError(null);
    try {
      await removeLoggedSale(saleId);
      refreshPrices();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Screen>
      <BackLink />
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={[styles.top, wide ? styles.topWide : null]}>
        {image ? (
          <Image
            source={{ uri: image }}
            resizeMode="contain"
            accessibilityLabel={`${item.name} card`}
            style={[styles.image, { width: imageWidth, height: Math.round(imageWidth * 1.4) }]}
          />
        ) : (
          <CardArt gameId={item.game_id} width={imageWidth} height={Math.round(imageWidth * 1.4)} />
        )}

        <View style={styles.info}>
          <AppText variant="eyebrow">{gameName ?? 'Card'}</AppText>
          <AppText variant="title" accessibilityRole="header">
            {item.name}
          </AppText>
          <AppText variant="body" color={colors.textMuted}>
            {[item.set?.name, `#${item.number}`, item.rarity].filter(Boolean).join(' · ')}
          </AppText>

          <Surface style={{ gap: 12, marginTop: 6 }}>
            {price.loading && !price.data ? <ActivityIndicator color={colors.accent} /> : <PriceGuidePanel price={price.data} />}
          </Surface>

          <View style={styles.actions}>
            <Button label="Add to binder" icon="plus" onPress={() => setSheet('add')} />
            <Button
              label="Sell this card"
              variant="outline"
              icon="tag"
              onPress={() => router.push({ pathname: '/market/new', params: { cardId: item.id, condition: 'NM' } })}
            />
            {profile?.in_guild ? (
              <Button label="Log a sale" variant="outline" icon="cash" onPress={() => setSheet('log')} />
            ) : null}
          </View>
        </View>
      </View>

      {(listings.data ?? []).length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionHeader title="For sale on HunterX" />
          <View style={styles.grid}>
            {(listings.data ?? []).map((listing) => (
              <ListingCard key={listing.id} listing={listing} width={tileWidth} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        <SectionHeader title="Recent sales" />
        {sales.data && sales.data.length === 0 ? (
          <AppText variant="small">
            No sales recorded yet. Sales show up here when a listing is marked sold, or when a member logs one.
          </AppText>
        ) : null}
        {graded.length > 0 ? <GradedSummary sales={graded} /> : null}
        {(sales.data ?? []).length > 0 ? (
          <Surface style={{ padding: 0, overflow: 'hidden' }}>
            {(sales.data ?? []).map((sale, index) => (
              <View key={sale.id} style={[styles.saleRow, index > 0 ? styles.divider : null]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong">{saleLabel(sale, conditionLabels)}</AppText>
                  <AppText variant="small">
                    {timeAgo(sale.sold_at)} ·{' '}
                    {sale.source === 'market' ? 'Sold on HunterX' : sale.mine ? 'You logged this' : 'Logged by a member'}
                  </AppText>
                </View>
                <AppText variant="heading">{peso(sale.price)}</AppText>
                {sale.can_remove ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove this logged sale"
                    onPress={() => remove(sale.id)}
                    style={styles.remove}
                  >
                    <Icon name="trash" size={18} color={colors.down} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </Surface>
        ) : null}
      </View>

      <AddToBinderSheet
        visible={sheet === 'add'}
        cardId={item.id}
        cardName={item.name}
        onClose={() => setSheet(null)}
        onAdded={() => {
          setSheet(null);
          setNotice(`Added ${item.name} to your binder.`);
        }}
      />
      <LogSaleSheet
        visible={sheet === 'log'}
        cardId={item.id}
        cardName={item.name}
        onClose={() => setSheet(null)}
        onSaved={() => {
          setSheet(null);
          setNotice('Sale saved. Thanks for keeping the HunterX price real.');
          refreshPrices();
        }}
      />
    </Screen>
  );
}

/** Typical price per grade, e.g. "PSA 10 · ₱5,000 (3 sales)". */
function GradedSummary({ sales }: { sales: { grader: string | null; grade: number | null; price: number }[] }) {
  const groups = new Map<string, number[]>();
  for (const sale of sales) {
    const key = [sale.grader, sale.grade].filter((part) => part !== null).join(' ');
    groups.set(key, [...(groups.get(key) ?? []), sale.price]);
  }
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  return (
    <Surface style={{ gap: 6 }}>
      <AppText variant="eyebrow">Graded slabs</AppText>
      {[...groups.entries()].map(([label, prices]) => (
        <View key={label} style={styles.gradedRow}>
          <AppText variant="bodyStrong" style={{ flex: 1 }}>
            {label}
          </AppText>
          <AppText variant="body">
            {peso(median(prices))} <AppText variant="small">({prices.length} sale{prices.length === 1 ? '' : 's'})</AppText>
          </AppText>
        </View>
      ))}
    </Surface>
  );
}

function BackLink() {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/prices'))}
      style={styles.back}
    >
      <Icon name="chevronLeft" size={22} color={colors.text} strokeWidth={2} />
      <AppText variant="bodyStrong">Back</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  top: { gap: 20 },
  topWide: { flexDirection: 'row', alignItems: 'flex-start' },
  image: { borderRadius: 14, backgroundColor: '#16161A', alignSelf: 'center' },
  info: { flex: 1, gap: 6, minWidth: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 24 },
  saleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
  remove: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  gradedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
