import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { listingImage } from '@/lib/market';
import { peso } from '@/lib/format';
import { colors } from '@/lib/theme';
import type { ListingWithRefs } from '@/lib/types';

import { AppText } from './AppText';
import { CardArt } from './CardArt';
import { Icon } from './Icon';

/** Grid tile for a listing: picture, title, price, seller and delivery. */
export function ListingCard({ listing, width }: { listing: ListingWithRefs; width: number }) {
  const image = listingImage(listing);
  const tall = listing.kind === 'card' || listing.kind === 'graded';
  const imageHeight = Math.round(tall ? (width * 7) / 5 : width);
  const where = [listing.meetup ? listing.meetup_area || 'Meetup' : null, listing.shipping ? 'Ships' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${listing.title}, ${peso(listing.price)}`}
      onPress={() => router.push({ pathname: '/market/[id]', params: { id: listing.id } })}
      style={({ pressed }) => [{ width, gap: 8 }, pressed ? { opacity: 0.85 } : null]}
    >
      <View>
        <CardArt gameId={listing.game_id} imageUrl={image} width={width} height={imageHeight} />
        {listing.status !== 'active' ? (
          <View style={styles.status}>
            <AppText variant="smallStrong" color={colors.onAccent} style={{ fontSize: 11 }}>
              {listing.status === 'reserved' ? 'Reserved' : listing.status === 'sold' ? 'Sold' : 'Removed'}
            </AppText>
          </View>
        ) : null}
        {listing.photos.length > 1 ? (
          <View style={styles.photoCount}>
            <Icon name="camera" size={12} color={colors.text} strokeWidth={2} />
            <AppText variant="smallStrong" style={{ fontSize: 11 }}>
              {listing.photos.length}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={2} style={{ fontSize: 14, lineHeight: 19 }}>
          {listing.title}
        </AppText>
        <AppText variant="bodyStrong" style={{ fontSize: 16 }}>
          {peso(listing.price)}
        </AppText>
        <View style={styles.sellerRow}>
          <AppText variant="small" numberOfLines={1} style={{ flexShrink: 1, fontSize: 12 }}>
            {listing.seller?.display_name ?? listing.seller?.username ?? 'Member'}
          </AppText>
          {listing.seller?.is_verified_seller ? (
            <Icon name="check" size={12} color={colors.verifiedText} strokeWidth={2.6} />
          ) : null}
        </View>
        {where ? (
          <AppText variant="small" numberOfLines={1} style={{ fontSize: 12 }}>
            {where}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  status: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.gold,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  photoCount: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(14,14,16,0.75)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
